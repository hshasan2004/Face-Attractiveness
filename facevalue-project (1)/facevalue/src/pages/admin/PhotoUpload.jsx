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
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
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

export default function PhotoUpload() {
  const [surveys, setSurveys] = useState([])
  const [selectedSurvey, setSelectedSurvey] = useState('')
  const [celebrities, setCelebrities] = useState([])
  const [selectedCeleb, setSelectedCeleb] = useState('')
  const [photoCounts, setPhotoCounts] = useState({})
  const [dragOver, setDragOver] = useState(false)
  const [imageSrc, setImageSrc] = useState(null)
  const [showCrop, setShowCrop] = useState(false)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [aspect, setAspect] = useState(3 / 4)
  const [croppedArea, setCroppedArea] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [bucketError, setBucketError] = useState(false)
  const [selectedFileName, setSelectedFileName] = useState('')
  const [imageId, setImageId] = useState('')
  const fileRef = useRef()

  useEffect(() => { loadSurveys() }, [])
  useEffect(() => { if (selectedSurvey) loadCelebrities() }, [selectedSurvey])

  async function loadSurveys() {
    const { data } = await supabase.from('surveys').select('id, title').order('created_at', { ascending: false })
    setSurveys(data || [])
    if (data?.length) setSelectedSurvey(data[0].id)
  }

  async function loadCelebrities() {
    const { data: celebs } = await supabase.from('celebrities').select('*').eq('survey_id', selectedSurvey).order('name')
    if (!celebs) return
    setCelebrities(celebs)
    const { data: photos } = await supabase.from('celebrity_photos').select('celebrity_id').in('celebrity_id', celebs.map(c => c.id))
    const counts = {}
    photos?.forEach(p => { counts[p.celebrity_id] = (counts[p.celebrity_id] || 0) + 1 })
    setPhotoCounts(counts)
    if (celebs.length && !selectedCeleb) setSelectedCeleb(celebs[0].id)
  }

  function handleFileSelect(file) {
    if (!file) return
    setUploadMsg('')
    setBucketError(false)
    setSelectedFileName(file.name || '')
    setImageId(defaultImageIdFromName(file.name || ''))
    const reader = new FileReader()
    reader.onload = () => { setImageSrc(reader.result); setShowCrop(true) }
    reader.readAsDataURL(file)
  }

  function onDrop(e) {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const onCropComplete = useCallback((_, pixels) => { setCroppedArea(pixels) }, [])

  async function handleUpload() {
    if (!croppedArea || !imageSrc || !selectedCeleb) return
    setUploading(true)
    setUploadMsg('')
    setBucketError(false)
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedArea)
      const fileName = normalizeUploadedBaseName(imageId || selectedFileName)
      const { error: storageErr } = await supabase.storage
        .from(CELEBRITY_PHOTOS_BUCKET)
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false })
      if (storageErr) {
        if (/bucket not found|not found/i.test(storageErr.message)) {
          throw new Error(
            `BUCKET_MISSING:${CELEBRITY_PHOTOS_BUCKET}`
          )
        }
        throw storageErr
      }
      const currentCount = photoCounts[selectedCeleb] || 0
      const { error: dbErr } = await supabase.from('celebrity_photos').insert({
        celebrity_id: selectedCeleb,
        storage_path: fileName,
        display_order: currentCount
      })
      if (dbErr) throw dbErr
      setUploadMsg('Photo uploaded successfully!')
      setBucketError(false)
      setShowCrop(false); setImageSrc(null); setSelectedFileName(''); setImageId('')
      loadCelebrities()
    } catch (err) {
      const msg = err?.message || String(err)
      if (msg.startsWith('BUCKET_MISSING:')) {
        const name = msg.slice('BUCKET_MISSING:'.length)
        setBucketError(true)
        setUploadMsg(`Storage bucket "${name}" is not registered in this Supabase project yet.`)
      } else {
        setBucketError(false)
        setUploadMsg(`Error: ${msg}`)
      }
    } finally {
      setUploading(false)
    }
  }

  const selectedCelebData = celebrities.find(c => c.id === selectedCeleb)
  const currentPhotoCount = photoCounts[selectedCeleb] || 0

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Photo Upload</h2>
          <p className="admin-page-subtitle">Upload and crop celebrity photos</p>
        </div>
      </div>

      {/* Survey / celebrity selector */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
          <label className="form-label">Survey</label>
          <select className="form-input" value={selectedSurvey} onChange={e => setSelectedSurvey(e.target.value)}>
            {surveys.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ flex: 2, minWidth: '220px' }}>
          <label className="form-label">Celebrity</label>
          <select className="form-input" value={selectedCeleb} onChange={e => setSelectedCeleb(e.target.value)}>
            {celebrities.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} — {photoCounts[c.id] || 0}/5 photos
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedCelebData && (
        <div className="card" style={{ marginBottom: '20px', display: 'flex', gap: '16px', alignItems: 'center', padding: '16px 20px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{selectedCelebData.name}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{currentPhotoCount}/5 photos uploaded</div>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{ width: '12px', height: '12px', borderRadius: '50%', background: i < currentPhotoCount ? 'var(--accent)' : 'var(--border)' }} />
            ))}
          </div>
          {currentPhotoCount >= 5 && <span className="pill pill-success">Complete</span>}
        </div>
      )}

      {/* Drop zone */}
      {!showCrop && (
        <div
          className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
        >
          <div className="drop-zone-icon">📷</div>
          <div className="drop-zone-text">Drop photos here or click to upload</div>
          <div className="drop-zone-hint">Accepts JPG, PNG, WEBP</div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFileSelect(e.target.files[0])} />
        </div>
      )}

      {uploadMsg && (
        <div className={uploadMsg.startsWith('Error') || bucketError ? 'error-msg' : 'success-msg'} style={{ marginBottom: '16px' }}>
          {uploadMsg}
          {bucketError && (
            <p style={{ margin: '12px 0 0', fontSize: '0.85rem', lineHeight: 1.55 }}>
              Run the SQL in <Link to="/admin/dbsetup" style={{ color: 'var(--accent)' }}>DB Setup</Link> (section <strong>Storage: create celebrity-photos bucket</strong>), or create the bucket manually under Supabase → Storage. Match the name in <code>.env.local</code> as <code>VITE_STORAGE_BUCKET</code> if you use a different id.
            </p>
          )}
        </div>
      )}

      {/* Crop Modal */}
      {showCrop && imageSrc && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '1rem' }}>Crop Photo</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowCrop(false); setImageSrc(null); setUploadMsg(''); setBucketError(false); setImageId('') }}>Cancel</button>
          </div>

          <div className="form-group" style={{ marginBottom: '12px' }}>
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
          <div className="crop-controls" style={{ marginBottom: '12px' }}>
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
          <div className="cropper-wrapper">
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
          <div className="crop-slider-group" style={{ marginBottom: '20px' }}>
            <span className="crop-slider-label">Zoom</span>
            <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} />
            <span className="crop-slider-val">{zoom.toFixed(1)}×</span>
          </div>

          <button className="btn btn-gold btn-lg" disabled={uploading || !croppedArea} onClick={handleUpload} style={{ width: '100%', justifyContent: 'center' }}>
            {uploading ? <><span className="spinner" /> Uploading...</> : 'Apply Crop & Upload'}
          </button>
        </div>
      )}

      {/* Requirements */}
      <div className="requirements-card">
        <h4>Upload Requirements</h4>
        <div className="req-item">Format: JPG, PNG, or WEBP</div>
        <div className="req-item">Minimum resolution: 1200×2000px recommended</div>
        <div className="req-item">Pose: Frontal facing, head and shoulders visible</div>
        <div className="req-item">Expression: Neutral or mild smile</div>
        <div className="req-item">Restrictions: No sunglasses, no masks, no heavy filters</div>
        <div className="req-item">5 photos required per celebrity before survey can be activated</div>
        <div className="req-item">
          Storage bucket must exist in Supabase as <code style={{ fontSize: '0.85em' }}>{CELEBRITY_PHOTOS_BUCKET}</code> (public). Override with <code>VITE_STORAGE_BUCKET</code> in <code>.env.local</code> if you use a different name.
        </div>
      </div>
    </div>
  )
}
