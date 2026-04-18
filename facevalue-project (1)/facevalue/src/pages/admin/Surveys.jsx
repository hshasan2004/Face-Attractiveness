import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { normalizeSurveyStatus } from '../../utils/surveyHelpers'

function columnMissing(err, col) {
  const m = err?.message || ''
  return m.includes(col) && (m.includes('schema cache') || m.includes('Could not find'))
}

export default function Surveys() {
  const [surveys, setSurveys] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    images_per_session: 100,
    evaluators_needed: 30
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [legacyCelebrityConstraint, setLegacyCelebrityConstraint] = useState(false)

  useEffect(() => {
    loadSurveys()
  }, [])

  async function loadSurveys() {
    setLoading(true)
    const { data } = await supabase.from('surveys').select('*').order('created_at', { ascending: false })
    setSurveys(data || [])
    setLoading(false)
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setLegacyCelebrityConstraint(false)

    // Validation
    if (!form.title.trim()) {
      setError('Title is required.')
      return
    }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const base = {
      title: form.title.trim(),
      description: form.description?.trim() || null,
      images_per_session: form.images_per_session,
      evaluators_needed: form.evaluators_needed,
      created_by: user.id
    }
    let err = null
    ;({ error: err } = await supabase.from('surveys').insert({ ...base, status: 'draft', is_active: false }))
    if (err && columnMissing(err, 'status')) {
      ;({ error: err } = await supabase.from('surveys').insert({ ...base, is_active: false }))
    }
    if (err && columnMissing(err, 'is_active')) {
      ;({ error: err } = await supabase.from('surveys').insert({ ...base, status: 'draft' }))
    }
    if (err && (columnMissing(err, 'status') || columnMissing(err, 'is_active'))) {
      ;({ error: err } = await supabase.from('surveys').insert(base))
    }

    if (err) {
      const msg = err.message || ''
      if (/celebrity1_id|celebrity2_id/i.test(msg) && /not-null|null value|violates/i.test(msg)) {
        setLegacyCelebrityConstraint(true)
        setError(msg)
      } else {
        setError(msg)
      }
      setSaving(false)
      return
    }
    
    setShowModal(false)
    setForm({
      title: '',
      description: '',
      images_per_session: 100,
      evaluators_needed: 30
    })
    loadSurveys()
    setSaving(false)
  }

  async function updateStatus(id, status) {
    const is_active = status === 'active'
    let { error } = await supabase.from('surveys').update({ status, is_active }).eq('id', id)
    if (error && columnMissing(error, 'status')) {
      ;({ error } = await supabase.from('surveys').update({ is_active }).eq('id', id))
    }
    if (error && columnMissing(error, 'is_active')) {
      ;({ error } = await supabase.from('surveys').update({ status }).eq('id', id))
    }
    if (!error) {
      setSurveys(prev => prev.map(s => (s.id === id ? { ...s, status, is_active } : s)))
    }
  }

  const statusColors = { draft: 'pill-muted', active: 'pill-success', closed: 'pill-danger' }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Surveys</h2>
          <p className="admin-page-subtitle">Manage research surveys</p>
        </div>
        <button className="btn btn-gold" onClick={() => setShowModal(true)}>+ New Survey</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Images</th>
              <th>Evaluators</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
            ) : surveys.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>No surveys yet. Create your first one.</td></tr>
            ) : surveys.map(s => {
              const st = normalizeSurveyStatus(s)
              return (
              <tr key={s.id}>
                <td style={{ fontWeight: 500 }}>{s.title}</td>
                <td><span className={`pill ${statusColors[st] || 'pill-muted'}`}>{st}</span></td>
                <td>{s.images_per_session}</td>
                <td>{s.evaluators_needed}</td>
                <td style={{ color: 'var(--muted)', fontSize: '0.825rem' }}>{new Date(s.created_at).toLocaleDateString()}</td>
                <td>
                  <div className="survey-row-actions">
                    <select
                      className="form-input"
                      value={st}
                      onChange={e => updateStatus(s.id, e.target.value)}
                      style={{ padding: '5px 28px 5px 10px', fontSize: '0.8rem', width: 'auto' }}
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={e => {
          if (e.target !== e.currentTarget) return
          setShowModal(false)
          setLegacyCelebrityConstraint(false)
          setError('')
        }}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">New Survey</span>
              <button type="button" className="modal-close" onClick={() => { setShowModal(false); setLegacyCelebrityConstraint(false); setError('') }}>✕</button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Survey Title</label>
                <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. BD Celebrities Wave 1" />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of this survey..." />
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
                Add celebrities under <strong>Celebrities</strong> (pick this survey), upload photos, then set status to <strong>Active</strong> here when ready.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Images Per Session</label>
                  <input className="form-input" type="number" value={form.images_per_session} onChange={e => setForm(f => ({ ...f, images_per_session: parseInt(e.target.value) }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Evaluators Needed</label>
                  <input className="form-input" type="number" value={form.evaluators_needed} onChange={e => setForm(f => ({ ...f, evaluators_needed: parseInt(e.target.value) }))} />
                </div>
              </div>
              {error && <div className="error-msg">{error}</div>}
              {legacyCelebrityConstraint && (
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.55, margin: 0 }}>
                  Your <code>surveys</code> table still has required <code>celebrity1_id</code> / <code>celebrity2_id</code> columns from an old design. Run the migration in{' '}
                  <Link to="/admin/dbsetup" style={{ color: 'var(--accent)' }}>DB Setup</Link> under <strong>Legacy schema: celebrity1_id / celebrity2_id NOT NULL</strong>, then create the survey again.
                </p>
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => { setShowModal(false); setLegacyCelebrityConstraint(false); setError('') }}>Cancel</button>
                <button type="submit" className="btn btn-gold" disabled={saving}>{saving ? <span className="spinner" /> : 'Create Survey'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
