import { useState } from 'react'
import './SqlConsole.css'

const API = `${import.meta.env.VITE_API_URL}/api/db/sql`
const EXAMPLES = {
  update: "UPDATE camerasightings SET vehicle_color = 'Red' WHERE plate_number = 'TN68RH2352';",
  insert: "INSERT INTO insurance_records (reg_no, owner_name, insurer_company, policy_type, is_active, premium_amount) VALUES ('TN68RH2352', 'Test Owner', 'Example Insurance', 'Comprehensive', TRUE, 12000);",
  delete: "DELETE FROM mot_reports WHERE vehicle_number = 'TN68RH2352' AND report_type = 'Test';",
}

function PreviewRows({ title, rows, emptyText }) {
  return (
    <section className="sql-preview-side">
      <h3>{title}</h3>
      {!rows?.length ? <p className="muted">{emptyText}</p> : rows.map((row, index) => (
        <pre key={row._id || row.id || index}>{JSON.stringify(row, null, 2)}</pre>
      ))}
    </section>
  )
}

export default function SqlConsole() {
  const [sql, setSql] = useState(EXAMPLES.update)
  const [preview, setPreview] = useState(null)
  const [correction, setCorrection] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const runPreview = async (event, options = {}) => {
    event?.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    setPreview(null)
    setCorrection(null)
    try {
      const response = await fetch(`${API}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, ...options }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not preview this command')
      if (data.needsCorrection) {
        setCorrection(data)
      } else {
        setCorrection(null)
        setPreview(data)
        if (data.effectiveSql) setSql(data.effectiveSql)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const confirmAndRun = async () => {
    if (!preview) return
    const confirmed = window.confirm(
      `${preview.action} will affect ${preview.affectedCount} record(s) in ${preview.source}. Execute this change?`
    )
    if (!confirmed) return

    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`${API}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previewId: preview.previewId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not execute this command')
      setNotice(`${data.action} completed. ${data.affectedCount} record(s) changed in ${data.source}.`)
      setPreview(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sql-console">
      <header className="sql-header">
        <h1>SQL Console</h1>
        <p>Write one INSERT, UPDATE, or DELETE. The app previews the affected data before you confirm the change.</p>
      </header>

      <div className="sql-examples">
        <span>Examples:</span>
        {Object.entries(EXAMPLES).map(([kind, command]) => (
          <button key={kind} type="button" onClick={() => { setSql(command); setPreview(null); setCorrection(null); setError(''); setNotice('') }}>
            {kind[0].toUpperCase() + kind.slice(1)}
          </button>
        ))}
      </div>

      <form className="sql-command-form" onSubmit={runPreview}>
        <label htmlFor="sql-command">Mutation command</label>
        <textarea id="sql-command" value={sql} onChange={event => { setSql(event.target.value); setPreview(null); setCorrection(null) }} spellCheck="false" />
        <p className="sql-help">Use a source name or table name. UPDATE and DELETE require a WHERE clause with equality conditions joined by AND. Up to 100 matched records can be changed per command.</p>
        <button type="submit" disabled={busy || !sql.trim()}>{busy ? 'Working…' : 'Preview changes'}</button>
      </form>

      {error && <div className="error-box">{error}</div>}
      {notice && <div className="sql-notice">{notice}</div>}

      {correction && (
        <section className="sql-correction">
          <h2>Did you mean one of these plates?</h2>
          <p>No exact plate match was found for <strong>{correction.inputPlate}</strong> in this command. Choose a suggestion to update the command and preview it, or keep the plate you entered.</p>
          <div className="sql-suggestion-list">
            {correction.suggestions.map(candidate => (
              <article className="sql-suggestion" key={candidate.plate}>
                <div>
                  <strong>{candidate.plate}</strong>
                  <span>{candidate.score}% rank · {candidate.plateSimilarity}% plate similarity · distance {candidate.plateDistance}</span>
                  <small>{[candidate.registration?.make, candidate.registration?.model, candidate.registration?.year, candidate.camera?.color].filter(Boolean).join(' | ') || 'No vehicle context recorded'}</small>
                </div>
                <button type="button" disabled={busy} onClick={() => runPreview(null, { acceptedPlate: candidate.plate })}>Use this plate</button>
              </article>
            ))}
          </div>
          <button type="button" className="sql-keep-plate" disabled={busy} onClick={() => runPreview(null, { ignoreSuggestions: true })}>Keep entered plate and preview</button>
        </section>
      )}

      {preview && (
        <section className="sql-preview">
          <div className="sql-preview-heading">
            <div>
              <h2>Review before execution</h2>
              <p><strong>{preview.action}</strong> · {preview.source} · {preview.affectedCount} record(s)</p>
            </div>
            <span>Preview only; database is unchanged so far.</span>
          </div>
          <div className="sql-preview-grid">
            {preview.action !== 'INSERT' && <PreviewRows title={preview.action === 'DELETE' ? 'Records to delete' : 'Current records'} rows={preview.before} emptyText="No existing records." />}
            {preview.action !== 'DELETE' && <PreviewRows title={preview.action === 'INSERT' ? 'Proposed insert' : 'Proposed records'} rows={preview.after} emptyText="No proposed records." />}
          </div>
          <div className="sql-preview-actions">
            <button type="button" className="sql-cancel" disabled={busy} onClick={() => setPreview(null)}>Cancel</button>
            <button type="button" className="sql-confirm" disabled={busy} onClick={confirmAndRun}>{busy ? 'Executing…' : 'Confirm and execute'}</button>
          </div>
        </section>
      )}
    </div>
  )
}
