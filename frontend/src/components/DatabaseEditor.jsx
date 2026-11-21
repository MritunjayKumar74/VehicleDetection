import { useState, useEffect, useCallback } from 'react'
import './DatabaseEditor.css'

const SOURCES = [
  'DB1_CameraSightings',
  'DB2_InsuranceRecords',
  'DB3_VehicleRegistration',
  'DB4_TheftRecords',
  'DB5_MotReports',
]

const PHASE3_SCHEMAS = [
  {
    source: 'DB1', title: 'Camera Sightings', engine: 'MongoDB · cameradb', referenceLabel: 'REF',
    entities: [
      { name: 'p3_locations', pk: '_id' },
      { name: 'p3_cameras', pk: '_id', refs: ['location_id → p3_locations._id'] },
      { name: 'p3_observed_vehicles', pk: '_id' },
      { name: 'p3_camera_sightings', pk: '_id', refs: ['camera_id → p3_cameras._id', 'vehicle_id → p3_observed_vehicles._id'] },
      { name: 'p3_sighting_media', pk: '_id', refs: ['sighting_id → p3_camera_sightings._id'] },
    ],
    note: 'MongoDB ObjectId references are application-managed; MongoDB does not enforce foreign-key constraints.',
  },
  {
    source: 'DB2', title: 'Insurance Records', engine: 'PostgreSQL · insurancedb', referenceLabel: 'FK',
    entities: [
      { name: 'insurers', pk: 'insurer_id' },
      { name: 'coverage_types', pk: 'coverage_type_id' },
      { name: 'insurance_policies', pk: 'policy_id', refs: ['insurer_id → insurers.insurer_id', 'coverage_type_id → coverage_types.coverage_type_id'] },
      { name: 'policy_renewals', pk: 'renewal_id', refs: ['policy_id → insurance_policies.policy_id'] },
      { name: 'insurance_claims', pk: 'claim_id', refs: ['policy_id → insurance_policies.policy_id'] },
    ],
    note: 'Legacy insurance_records remains for existing Phase 2/editor paths; the five entities above are the Phase 3 normalized schema.',
  },
  {
    source: 'DB3', title: 'Vehicle Registration', engine: 'MySQL · rtodb', referenceLabel: 'FK',
    entities: [
      { name: 'rto_owners', pk: 'owner_id' },
      { name: 'rto_vehicle_models', pk: 'model_id' },
      { name: 'rto_vehicles', pk: 'vehicle_id', refs: ['model_id → rto_vehicle_models.model_id'] },
      { name: 'rto_registrations', pk: 'registration_id', refs: ['vehicle_id → rto_vehicles.vehicle_id', 'owner_id → rto_owners.owner_id'] },
      { name: 'rto_ownership_history', pk: 'history_id', refs: ['registration_id → rto_registrations.registration_id', 'owner_id → rto_owners.owner_id'] },
    ],
    note: 'Legacy vehicle_registrations remains for existing Phase 2/editor paths; the five entities above are the Phase 3 normalized schema.',
  },
  {
    source: 'DB4', title: 'Theft Records', engine: 'MongoDB · theftdb', referenceLabel: 'REF',
    entities: [
      { name: 'p3_police_stations', pk: '_id' },
      { name: 'p3_reported_vehicles', pk: '_id' },
      { name: 'p3_theft_cases', pk: '_id', refs: ['station_id → p3_police_stations._id'] },
      { name: 'p3_case_vehicles', pk: '_id', refs: ['case_id → p3_theft_cases._id', 'vehicle_id → p3_reported_vehicles._id'] },
      { name: 'p3_case_updates', pk: '_id', refs: ['case_id → p3_theft_cases._id'] },
    ],
    note: 'MongoDB ObjectId references are application-managed; MongoDB does not enforce foreign-key constraints.',
  },
  {
    source: 'DB5', title: 'MOT Reports', engine: 'PostgreSQL · motdb', referenceLabel: 'FK',
    entities: [
      { name: 'inspection_centres', pk: 'centre_id' },
      { name: 'mot_vehicles', pk: 'vehicle_id' },
      { name: 'mot_tests', pk: 'test_id', refs: ['vehicle_id → mot_vehicles.vehicle_id', 'centre_id → inspection_centres.centre_id'] },
      { name: 'mot_defects', pk: 'defect_id', refs: ['test_id → mot_tests.test_id'] },
      { name: 'mot_actions', pk: 'action_id', refs: ['test_id → mot_tests.test_id'] },
    ],
    note: 'Legacy mot_reports remains for existing Phase 2/editor paths; the five entities above are the Phase 3 normalized schema.',
  },
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

      <section className="phase3-schema" aria-labelledby="phase3-schema-title">
        <div className="phase3-schema-heading">
          <div>
            <span className="phase3-eyebrow">PHASE 3 · NORMALIZED STRUCTURE</span>
            <h2 id="phase3-schema-title">Five sources, five tables each</h2>
            <p>Every card shows each Phase 3 table or collection, its primary key, and the foreign-key/reference links to related entities.</p>
          </div>
          <span className="phase3-schema-badge">25 PHASE 3 TABLES / COLLECTIONS</span>
        </div>

        <div className="phase3-schema-grid">
          {PHASE3_SCHEMAS.map(schema => (
            <article className="phase3-source-card" key={schema.source}>
              <div className="phase3-source-title">
                <span className="phase3-source-number">{schema.source}</span>
                <div><h3>{schema.title}</h3><small>{schema.engine}</small></div>
              </div>
              <div className="phase3-entity-list" aria-label={`${schema.title} entities`}>
                {schema.entities.map(entity => (
                  <div className="phase3-entity" key={entity.name}>
                    <div className="phase3-entity-name">
                      <i className="fas fa-table" aria-hidden="true" />
                      <code>{entity.name}</code>
                    </div>
                    <div className="phase3-keyline"><span className="phase3-key-badge phase3-pk-badge">PK</span><code>{entity.pk}</code></div>
                    {entity.refs?.map(reference => (
                      <div className="phase3-keyline" key={reference}>
                        <span className="phase3-key-badge">{schema.referenceLabel}</span>
                        <code>{reference}</code>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {schema.note && <p className="phase3-source-note">{schema.note}</p>}
            </article>
          ))}
        </div>
        <p className="phase3-schema-footnote">Schema view: the five normalized Phase 3 tables/collections for each source. MongoDB references are logical ObjectId links; SQL sources use enforced foreign keys.</p>
        <div className="phase3-browser-note"><strong>Record browser below:</strong> this is the existing source-level/legacy record view. It does not display or edit the 25 normalized Phase 3 tables shown above.</div>
      </section>

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
