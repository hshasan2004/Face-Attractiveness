import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import Cropper from 'react-easy-crop'
import { supabase } from '../../supabase/client'
import { CELEBRITY_PHOTOS_BUCKET } from '../../config/storage'
import { getCroppedImageBlob } from '../../utils/cropImage'

const ASPECT_RATIOS = [
  { label: 'Free', value: null },
  { label: '1:1', value: 1 },
  { label: '3:4', value: 3 / 4 },
  { label: '4:5', value: 4 / 5 },
]

function normalizeUploadedBaseName(value) {
  const raw = String(value || '').trim()
  const leaf = (raw.split(/[/\\]/).pop() || 'image').replace(/\.[^.]+$/, '')
  const safe = leaf.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'image'
  return `${safe}.jpg`
}

function defaultImageIdFromName(value) {
  return String(value || '').trim().replace(/\.[^.]+$/, '')
}

function storagePathToUrl(path) {
  if (!path) return ''
  try {
    const bucket = CELEBRITY_PHOTOS_BUCKET
    const url = supabase.storage.from(bucket).getPublicUrl(path)?.data?.publicUrl
    return url || `https://svvltnrmatvatayzneax.supabase.co/storage/v1/object/public/${bucket}/${path}`
  } catch {
    return ''
  }
}

export default function Celebrities() {
  const [surveys, setSurveys] = useState([])
  const [selectedSurvey, setSelectedSurvey] = useState('')
  const [celebrities, setCelebrities] = useState([])
  const [photoCounts, setPhotoCounts] = useState({})
  const [celeb_photos, setPhotos] = useState({})
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', gender: 'male' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [success, setSuccess] = useState('')
  
  // Photo edit state
  const [editingCelebrityId, setEditingCelebrityId] = useState(null)
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [imageSrc, setImageSrc] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [aspect, setAspect] = useState(3 / 4)
  const [croppedArea, setCroppedArea] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [imageId, setImageId] = useState('')
  const [brokenImages, setBrokenImages] = useState(new Set())
  const fileRef = useRef()

  const totalPhotos = Object.values(photoCounts).reduce((sum, count) => sum + count, 0)
  const maxPhotoCount = Math.max(1, ...Object.values(photoCounts))

  useEffect(() => { loadSurveys() }, [])
  useEffect(() => { if (selectedSurvey) loadCelebrities() }, [selectedSurvey])

  async function loadSurveys() {
    const { data } = await supabase.from('surveys').select('id, title').order('created_at', { ascending: false })
    setSurveys(data || [])
    if (data?.length) setSelectedSurvey(data[0].id)
  }

  async function loadCelebrities() {
    setLoading(true)
    setLoadError('')
    const { data: celebs, error: qerr } = await supabase
      .from('celebrities')
      .select('*')
      .eq('survey_id', selectedSurvey)
      .order('created_at')
    if (qerr) {
      setLoadError(qerr.message)
      setCelebrities([])
      setPhotoCounts({})
      setPhotos({})
      setLoading(false)
      return
    }
    setCelebrities(celebs || [])
    const ids = (celebs || []).map(c => c.id)
    if (!ids.length) {
      setPhotoCounts({})
      setPhotos({})
      setLoading(false)
      return
    }
    const { data: photos } = await supabase.from('celebrity_photos').select('*').in('celebrity_id', ids).order('display_order')
    const counts = {}
    const photosByActorId = {}
    photos?.forEach(p => {
      counts[p.celebrity_id] = (counts[p.celebrity_id] || 0) + 1
      if (!photosByActorId[p.celebrity_id]) photosByActorId[p.celebrity_id] = []
      photosByActorId[p.celebrity_id].push(p)
    })
    setPhotoCounts(counts)
    setPhotos(photosByActorId)
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!form.name.trim()) { setError('Name is required.'); return }
    if (!selectedSurvey) { setError('Select a survey first.'); return }
    setSaving(true)
    const { error: err } = await supabase.from('celebrities').insert({ name: form.name.trim(), gender: form.gender, survey_id: selectedSurvey })
    if (err) { setError(err.message) } else {
      setSuccess(`${form.name} added successfully.`)
      setForm({ name: '', gender: 'male' })
      loadCelebrities()
    }
    setSaving(false)
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete ${name}? This will also delete all their photos and ratings.`)) return
    await supabase.from('celebrities').delete().eq('id', id)
    loadCelebrities()
  }

  function handleFileSelect(file, celebId) {
    if (!file) return
    setEditingCelebrityId(celebId)
    setUploadMsg('')
    setSelectedFileName(file.name || '')
    setImageId(defaultImageIdFromName(file.name || ''))
    const reader = new FileReader()
    reader.onload = () => { setImageSrc(reader.result); setShowPhotoModal(true) }
    reader.readAsDataURL(file)
  }

  const onCropComplete = useCallback((_, pixels) => { setCroppedArea(pixels) }, [])

  async function handleUploadPhoto() {
    if (!croppedArea || !imageSrc || !editingCelebrityId) return
    setUploading(true)
    setUploadMsg('')
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedArea)
      const fileName = normalizeUploadedBaseName(imageId || selectedFileName)
      const { error: storageErr } = await supabase.storage
        .from(CELEBRITY_PHOTOS_BUCKET)
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false })
      if (storageErr) throw storageErr
      const currentCount = photoCounts[editingCelebrityId] || 0
      const { error: dbErr } = await supabase.from('celebrity_photos').insert({
        celebrity_id: editingCelebrityId,
        storage_path: fileName,
        display_order: currentCount
      })
      if (dbErr) throw dbErr
      setUploadMsg('Photo uploaded successfully!')
      setShowPhotoModal(false)
      setImageSrc(null)
      setSelectedFileName('')
      setImageId('')
      setEditingCelebrityId(null)
      loadCelebrities()
    } catch (err) {
      setUploadMsg(`Error: ${err?.message || String(err)}`)
    } finally {
      setUploading(false)
    }
  }

  async function handleDeletePhoto(photoId, storagePath) {
    if (!confirm('Delete this photo?')) return
    try {
      const { error } = await supabase.from('celebrity_photos').delete().eq('id', photoId)
      if (error) throw error
      await supabase.storage.from(CELEBRITY_PHOTOS_BUCKET).remove([storagePath]).catch(() => {})
      loadCelebrities()
    } catch (err) {
      alert('Error deleting photo: ' + err.message)
    }
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Celebrities</h2>
          <p className="admin-page-subtitle">{celebrities.length} celebrities and {totalPhotos} uploaded photos in this survey</p>
        </div>
        <select className="form-input" value={selectedSurvey} onChange={e => setSelectedSurvey(e.target.value)} style={{ width: 'auto' }}>
          {surveys.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </div>

      {loadError && (
        <div className="card" style={{ marginBottom: '24px', borderColor: 'rgba(224,85,85,0.45)' }}>
          <div className="error-msg" style={{ marginBottom: '12px' }}>{loadError}</div>
          {(loadError.includes('survey_id') || loadError.includes('schema cache')) && (
            <div style={{ fontSize: '0.875rem', color: 'var(--muted)', lineHeight: 1.65 }}>
              <p style={{ marginBottom: '12px' }}>
                Your <code>celebrities</code> table is missing the <code>survey_id</code> column this app expects. In Supabase: <strong>SQL Editor</strong> → New query → run the migration from{' '}
                <Link to="/admin/dbsetup" style={{ color: 'var(--accent)' }}>DB Setup</Link> (section &quot;Existing database: missing celebrities.survey_id&quot;), then reload this page.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Add Form */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '0.95rem', marginBottom: '16px' }}>Add Celebrity</h3>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 2, minWidth: '200px' }}>
            <label className="form-label">Full Name</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Celebrity name" />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: '140px' }}>
            <label className="form-label">Gender</label>
            <select className="form-input" value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <button type="submit" className="btn btn-gold" disabled={saving} style={{ marginBottom: '1px' }}>
            {saving ? <span className="spinner" /> : '+ Add'}
          </button>
        </form>
        {error && <div className="error-msg" style={{ marginTop: '12px' }}>{error}</div>}
        {success && <div className="success-msg" style={{ marginTop: '12px' }}>{success}</div>}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '0.875rem' }}>Celebrity Roster</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{celebrities.length} total</span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Gender</th>
              <th>Photos</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px' }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
            ) : celebrities.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)', fontSize: '0.875rem' }}>No celebrities added yet.</td></tr>
            ) : celebrities.map((c, i) => {
              const photoCount = photoCounts[c.id] || 0
              const hasPhotos = photoCount > 0
              const photos = celeb_photos[c.id] || []
              return (
                <tr key={c.id}>
                  <td style={{ color: 'var(--muted)', fontSize: '0.825rem' }}>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td>
                    <span style={{ color: c.gender === 'male' ? 'var(--male)' : 'var(--female)', fontSize: '0.825rem' }}>
                      {c.gender === 'male' ? '♂' : '♀'} {c.gender}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '76px',
                        height: '8px',
                        borderRadius: '999px',
                        background: 'var(--border)',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${(photoCount / maxPhotoCount) * 100}%`,
                          height: '100%',
                          background: 'var(--accent)'
                        }} />
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{photoCount}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`pill ${hasPhotos ? 'pill-success' : 'pill-muted'}`}>
                      {hasPhotos ? 'Has Photos' : 'No Photos'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        className="btn btn-ghost btn-sm" 
                        onClick={() => {
                          setEditingCelebrityId(c.id)
                          setTimeout(() => fileRef.current?.click(), 0)
                        }}
                      >
                        🖼️ Add
                      </button>
                      {hasPhotos && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingCelebrityId(editingCelebrityId === c.id ? null : c.id)}>
                          {editingCelebrityId === c.id ? '▼' : '►'} View
                        </button>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id, c.name)}>✕</button>
                    </div>
                  </td>
                  {editingCelebrityId === c.id && hasPhotos && (
                    <tr style={{ display: 'table-row' }}>
                      <td colSpan={6} style={{ padding: '20px', background: 'var(--bg-secondary)' }}>
                        <div style={{ marginBottom: '12px', fontSize: '0.875rem', fontWeight: 500 }}>Photos for {c.name}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '12px' }}>
                          {photos.map(photo => (
                            <div key={photo.id} style={{ position: 'relative', borderRadius: '6px', overflow: 'hidden', aspectRatio: '3/4', background: 'var(--border)' }}>
                              <img 
                                src={storagePathToUrl(photo.storage_path)} 
                                alt={`${c.name} photo`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={() => setBrokenImages(prev => new Set([...prev, photo.id]))}
                              />
                              {brokenImages.has(photo.id) && (
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--border)', fontSize: '2.5rem' }}>❌</div>
                              )}
                              <button 
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDeletePhoto(photo.id, photo.storage_path)}
                                style={{ position: 'absolute', bottom: '4px', right: '4px' }}
                              >
                                🗑️
                              </button>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Photo Upload Modal */}
      {showPhotoModal && imageSrc && (
        <div className="modal-backdrop" onClick={e => {
          if (e.target !== e.currentTarget) return
          setShowPhotoModal(false)
          setImageSrc(null)
          setImageId('')
          setEditingCelebrityId(null)
        }}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Crop Photo</span>
              <button type="button" className="modal-close" onClick={() => { setShowPhotoModal(false); setImageSrc(null); setImageId(''); setEditingCelebrityId(null) }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Image ID</label>
                <input
                  className="form-input"
                  value={imageId}
                  onChange={e => setImageId(e.target.value)}
                  placeholder="e.g. p1_img1"
                />
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '6px' }}>
                  Stored filename: {normalizeUploadedBaseName(imageId || selectedFileName)}
                </div>
              </div>

              {/* Aspect ratio buttons */}
              <div className="crop-controls" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {ASPECT_RATIOS.map(r => (
                  <button
                    key={r.label}
                    className={`btn btn-sm ${aspect === r.value ? 'btn-gold' : 'btn-ghost'}`}
                    onClick={() => setAspect(r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Cropper */}
              <div className="cropper-wrapper" style={{ position: 'relative', width: '100%', height: '400px', borderRadius: '8px', overflow: 'hidden' }}>
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={aspect}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  objectFit="contain"
                  restrictPosition
                  minZoom={1}
                  maxZoom={3}
                  style={{ containerStyle: { borderRadius: '8px' } }}
                />
              </div>

              {/* Zoom slider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Zoom</span>
                <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} style={{ flex: 1 }} />
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)', minWidth: '30px' }}>{zoom.toFixed(1)}×</span>
              </div>

              {uploadMsg && (
                <div className={uploadMsg.startsWith('Error') ? 'error-msg' : 'success-msg'}>
                  {uploadMsg}
                </div>
              )}

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => { setShowPhotoModal(false); setImageSrc(null); setImageId(''); setEditingCelebrityId(null) }}>Cancel</button>
                <button type="button" className="btn btn-gold" disabled={uploading || !croppedArea} onClick={handleUploadPhoto}>
                  {uploading ? <><span className="spinner" /> Uploading...</> : 'Apply Crop & Upload'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input 
        ref={fileRef} 
        type="file" 
        accept="image/*" 
        style={{ display: 'none' }} 
        onChange={e => {
          const file = e.target.files?.[0]
          if (file && editingCelebrityId) handleFileSelect(file, editingCelebrityId)
          e.target.value = ''
        }} 
      />
    </div>
  )
}
