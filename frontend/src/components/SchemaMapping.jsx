import { useState, useEffect } from 'react'
import './SchemaMapping.css'
function SchemaMapping() {
  const [registry, setRegistry] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('http://localhost:5000/api/schema/mapping')
      .then(res => res.json())
      .then(setRegistry)
      .catch(err => setError(err.message))
  }, [])

  if (error) return <div className="error-box">{error}</div>
  if (!registry) return <p>Loading schema...</p>

  return (
    <div className="schema-view">
      <h2>Global Schema: {registry.globalSchema.name}</h2>
      <p className="muted">{registry.globalSchema.fields.length} canonical fields, mediated across {Object.keys(registry.sources).length} sources</p>

      {Object.entries(registry.sources).map(([name, src]) => (
        <div key={name} className="card">
          <h3>{name}</h3>
          <p className="muted">{src.engine} — {src.database}{src.table ? `.${src.table}` : ''}{src.collection ? `.${src.collection}` : ''}</p>
          <p><strong>Join key:</strong> {src.joinKey.localField} → {src.joinKey.globalField} ({src.joinKey.matchType})</p>

          <table>
            <thead>
              <tr><th>Local Field</th><th>Global Field</th><th>Match Type</th></tr>
            </thead>
            <tbody>
              {src.fieldMappings.map((m, i) => (
                <tr key={i}>
                  <td>{m.localField}</td>
                  <td>{m.globalField}</td>
                  <td><span className="badge-small">{m.matchType}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

export default SchemaMapping