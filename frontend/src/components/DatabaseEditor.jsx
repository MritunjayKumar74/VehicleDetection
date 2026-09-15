import { useState, useEffect, useCallback } from 'react'
import './DatabaseEditor.css'

const SOURCES = [
  'DB1_CameraSightings',
  'DB2_InsuranceRecords',
  'DB3_VehicleRegistration',
  'DB4_TheftRecords',
  'DB5_MotReports',
]

const API = `${import.meta.env.VITE_API_URL}/api/db`
const POLL_INTERVAL = 5000

function DatabaseEditor() {
  const [activeSource, setActiveSource] = useState(SOURCES[0])
  const [records, setRecords]           = useState([])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [editingId, setEditingId]       = useState(null)
  const [editBuffer, setEditBuffer]     = useState({})
  const [inserting, setInserting]       = useState(false)
  const [insertBuffer, setInsertBuffer] = useState({})
  const [saving, setSaving]             = useState(false)

  // ── Fetch records ─────────────────────────────────────────────
  const fetchRecords = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/${activeSource}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRecords(data)
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [activeSource])

  // Initial load
  useEffect(() => {
    setRecords([])
    setEditingId(null)
    setInserting(false)
    setLoading(true)
    fetchRecords().finally(() => setLoading(false))
  }, [activeSource])

  // Poll every 5s
  useEffect(() => {
    const interval = setInterval(fetchRecords, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchRecords])

  // ── Derive columns from first record ──────────────────────────
  const columns = records.length > 0
    ? Object.keys(records[0]).filter(k => k !== '__v')
    : []

  const idField = records.length > 0 && records[0]._id ? '_id' : 'id'

  // ── Edit ──────────────────────────────────────────────────────
  function startEdit(record) {
    setEditingId(record[idField])
    setEditBuffer({ ...record })
    setInserting(false)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditBuffer({})
  }

  async function saveEdit() {
    setSaving(true)
    try {
      const { [idField]: id, __v, ...body } = editBuffer
      const res  = await fetch(`${API}/${activeSource}/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRecords(prev => prev.map(r => r[idField] === id ? data : r))
      setEditingId(null)
      setEditBuffer({})
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Insert ────────────────────────────────────────────────────
  function startInsert() {
    const blank = Object.fromEntries(columns.filter(c => c !== idField && c !== '__v').map(c => [c, '']))
    setInsertBuffer(blank)
    setInserting(true)
    setEditingId(null)
  }

  function cancelInsert() {
    setInserting(false)
    setInsertBuffer({})
  }

  async function saveInsert() {
    setSaving(true)
    try {
      const res  = await fetch(`${API}/${activeSource}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(insertBuffer),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRecords(prev => [...prev, data])
      setInserting(false)
      setInsertBuffer({})
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────────
  async function deleteRecord(id) {
    try {
      const res  = await fetch(`${API}/${activeSource}/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRecords(prev => prev.filter(r => r[idField] !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="db-editor">

      {/* Source tabs */}
      <div className="db-tabs">
        {SOURCES.map(s => (
          <button
            key={s}
            className={`db-tab ${activeSource === s ? 'active' : ''}`}
            onClick={() => setActiveSource(s)}
          >
            {s.replace('DB', 'DB').replace('_', ' — ')}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="db-toolbar">
        <span className="muted">{records.length} records · polling every {POLL_INTERVAL / 1000}s</span>
        <button className="btn-insert" onClick={startInsert} disabled={inserting}>
          + Insert Row
        </button>
      </div>

      {error   && <div className="error-box">{error}</div>}
      {loading && <p className="muted">Loading...</p>}

      {/* Table */}
      {!loading && columns.length > 0 && (
        <div className="db-table-wrap">
          <table className="db-table">
            <thead>
              <tr>
                {columns.map(c => <th key={c}>{c}</th>)}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>

              {/* Insert row */}
              {inserting && (
                <tr className="insert-row">
                  {columns.map(c => (
                    <td key={c}>
                      {c === idField || c === '__v' ? (
                        <span className="muted">auto</span>
                      ) : (
                        <input
                          value={insertBuffer[c] ?? ''}
                          onChange={e => setInsertBuffer(prev => ({ ...prev, [c]: e.target.value }))}
                        />
                      )}
                    </td>
                  ))}
                  <td>
                    <button className="btn-save" onClick={saveInsert} disabled={saving}>
                      {saving ? '...' : 'Save'}
                    </button>
                    <button className="btn-cancel" onClick={cancelInsert}>Cancel</button>
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {records.map(record => {
                const id        = record[idField]
                const isEditing = editingId === id
                return (
                  <tr key={String(id)} className={isEditing ? 'editing-row' : ''}>
                    {columns.map(c => (
                      <td key={c}>
                        {isEditing && c !== idField && c !== '__v' ? (
                          <input
                            value={editBuffer[c] ?? ''}
                            onChange={e => setEditBuffer(prev => ({ ...prev, [c]: e.target.value }))}
                          />
                        ) : (
                          <span>{String(record[c] ?? '')}</span>
                        )}
                      </td>
                    ))}
                    <td>
                      {isEditing ? (
                        <>
                          <button className="btn-save" onClick={saveEdit} disabled={saving}>
                            {saving ? '...' : 'Save'}
                          </button>
                          <button className="btn-cancel" onClick={cancelEdit}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button className="btn-edit" onClick={() => startEdit(record)}>Edit</button>
                          <button className="btn-delete" onClick={() => deleteRecord(id)}>Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}

            </tbody>
          </table>
        </div>
      )}

      {!loading && records.length === 0 && !error && (
        <p className="muted">No records found in {activeSource}</p>
      )}
    </div>
  )
}

export default DatabaseEditor