import { useState } from 'react'
import './App.css'
import Dashboard from './components/Dashboard'
import SchemaMapping from './components/SchemaMapping'
import DatabaseEditor from './components/DatabaseEditor'
import SqlConsole from './components/SqlConsole'
import PlateUpload from './PlateUpload';

function formatContextValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => item && typeof item === 'object'
      ? Object.entries(item).map(([key, itemValue]) => `${key}: ${itemValue}`).join(' · ')
      : String(item)).join('; ')
  }
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function readableFieldName(field) {
  return field.replace(/_/g, ' ')
}

function App() {
  const [plate, setPlate] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [matching, setMatching] = useState(false)
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [color, setColor] = useState('')
  const [algorithm, setAlgorithm] = useState(null)
  const [activePage, setActivePage] = useState('dashboard')
  const [contextQuery, setContextQuery] = useState('')
  const [contextSearchResult, setContextSearchResult] = useState(null)
  const [contextSearchError, setContextSearchError] = useState(null)
  const [contextSearchLoading, setContextSearchLoading] = useState(false)

  const runSearch = async (searchPlate = plate) => {
    const queryPlate = searchPlate.trim().toUpperCase()
    if (!queryPlate) return

    setLoading(true)
    setMatching(true)
    setError(null)
    setResult(null)
    setCandidates([])

    try {
      const candidateQuery = new URLSearchParams({ plate: queryPlate })
      if (make.trim()) candidateQuery.set('make', make.trim())
      if (model.trim()) candidateQuery.set('model', model.trim())
      if (color.trim()) candidateQuery.set('color', color.trim())

      const [lookupResponse, matchesResponse] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/api/vehicle/${encodeURIComponent(queryPlate)}?refresh=true`),
        fetch(`${import.meta.env.VITE_API_URL}/api/vehicle/matches?${candidateQuery.toString()}`),
      ])
      const [lookupData, matchesData] = await Promise.all([
        lookupResponse.json(),
        matchesResponse.json(),
      ])

      if (!lookupResponse.ok) throw new Error(lookupData.error || 'Lookup failed')
      if (!matchesResponse.ok) throw new Error(matchesData.error || 'Candidate matching failed')

      setResult(lookupData)
      setCandidates(matchesData.candidates || [])
      setAlgorithm(matchesData.algorithm || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setMatching(false)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    runSearch()
  }

  const handleContextSearch = async (e) => {
    e.preventDefault()
    const sentence = contextQuery.trim()
    if (!sentence) {
      setContextSearchError('Describe the vehicles you want to find.')
      setContextSearchResult(null)
      return
    }

    setContextSearchLoading(true)
    setContextSearchError(null)
    setContextSearchResult(null)
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/vehicle/context-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sentence }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Context search failed')
      setContextSearchResult(data)
    } catch (err) {
      setContextSearchError(err.message)
    } finally {
      setContextSearchLoading(false)
    }
  }

  const getStatusColor = (status) => {
    if (!status) return '#6b7280'

    const s = status.toLowerCase()

    if (
      s.includes('clear') ||
      s.includes('active') ||
      s.includes('valid')
    ) {
      return '#16a34a'
    }

    if (s.includes('expired')) {
      return '#d97706'
    }

    if (
      s.includes('uninsured') ||
      s.includes('stolen')
    ) {
      return '#dc2626'
    }

    return '#6b7280'
  }

  return (
    <div className="app-layout">

      {/* =========================
          SIDEBAR
      ========================= */}

      <aside className="sidebar">

        <div className="sidebar-logo">
          <h2>
            <i className="fas fa-car"></i>
            <span>Vehicle Intelligence</span>
          </h2>
        </div>

        <nav className="sidebar-nav">

          <button
            className={`sidebar-item ${
              activePage === 'dashboard' ? 'active' : ''
            }`}
            onClick={() => setActivePage('dashboard')}
          >
            <i className="fas fa-chart-line"></i>
            <span>Dashboard</span>
          </button>
          
          <button
            className={`sidebar-item ${
              activePage === 'search' ? 'active' : ''
            }`}
            onClick={() => setActivePage('search')}
          >
            <i className="fas fa-magnifying-glass"></i>
            <span>Vehicle Search</span>
          </button>

          <button
            className={`sidebar-item ${activePage === 'context-search' ? 'active' : ''}`}
            onClick={() => setActivePage('context-search')}
          >
            <i className="fas fa-filter"></i>
            <span>Context Search</span>
          </button>

          <button
            className={`sidebar-item ${
              activePage === 'ocr' ? 'active' : ''
            }`}
            onClick={() => setActivePage('ocr')}
          >
            <i className="fas fa-camera"></i>
            <span>Image OCR</span>
          </button>
          <button
            className={`sidebar-item ${
              activePage === 'schema' ? 'active' : ''
            }`}
            onClick={() => setActivePage('schema')}
          >
            <i className="fas fa-diagram-project"></i>
            <span>Schema Mapping</span>
          </button>

          <button
            className={`sidebar-item ${activePage === 'db-editor' ? 'active' : ''}`}
            onClick={() => setActivePage('db-editor')}
          >
            <i className="fas fa-table"></i>
            <span>Database Editor</span>
          </button>

          <button
            className={`sidebar-item ${activePage === 'sql-console' ? 'active' : ''}`}
            onClick={() => setActivePage('sql-console')}
          >
            <i className="fas fa-terminal"></i>
            <span>SQL Console</span>
          </button>
          
        </nav>

      </aside>


      {/* =========================
          MAIN CONTENT
      ========================= */}

      <main className="main-content">
          {activePage === 'dashboard' && (
            <Dashboard />
          )}
          
          {activePage === 'ocr' && <PlateUpload />}

          {activePage === 'schema' && (
            <SchemaMapping />  
          )}

          {activePage === 'db-editor' && (
            <DatabaseEditor />
          )}

          {activePage === 'sql-console' && <SqlConsole />}

          {activePage === 'context-search' && (
            <section className="context-search-page" aria-labelledby="context-search-title">
                <header className="context-search-page-header">
                  <span className="context-search-eyebrow">NATURAL-LANGUAGE DATABASE SEARCH</span>
                  <h1 id="context-search-title">Context Search</h1>
                  <p>Describe the vehicles you are looking for. The search checks connected structured sources and shows the database evidence behind each result.</p>
                </header>
                <form className="context-sentence-form" onSubmit={handleContextSearch}>
                  <label htmlFor="context-sentence">Describe the vehicles you want to find</label>
                  <textarea
                    id="context-sentence"
                    rows="3"
                    maxLength="300"
                    placeholder="List all vehicles whose colour is red"
                    value={contextQuery}
                    onChange={e => setContextQuery(e.target.value)}
                    disabled={contextSearchLoading}
                  />
                  <div className="context-sentence-actions">
                    <span>Examples: “Find silver Honda vehicles” · “List red SUVs near Gurugram”</span>
                    <button type="submit" disabled={contextSearchLoading || !contextQuery.trim()}>
                      {contextSearchLoading ? 'Searching databases…' : 'Search databases'}
                    </button>
                  </div>
                </form>
                {contextSearchError && <p className="context-search-error" role="alert">{contextSearchError}</p>}
                {contextSearchLoading && <p className="context-search-status">Searching linked records across all available sources…</p>}
                {contextSearchResult && (
                  <div className="context-search-results">
                    <div className="context-search-summary">
                      <strong>{contextSearchResult.totalMatches} matching vehicle{contextSearchResult.totalMatches === 1 ? '' : 's'}</strong>
                      <span>Sources checked: {contextSearchResult.sourceStatus.filter(source => !source.error).length}/5</span>
                    </div>
                    <div className="context-interpreted-query">
                      <b>Interpreted as:</b>
                      {Object.entries(contextSearchResult.parsedFilters || {}).map(([field, value]) => (
                        <span key={field}>{readableFieldName(field)}: {value}</span>
                      ))}
                    </div>
                    <p className="context-match-rule">{contextSearchResult.matchRule}</p>
                    {contextSearchResult.sourceStatus.some(source => source.error) && (
                      <p className="context-source-warning">Some sources could not be searched: {contextSearchResult.sourceStatus.filter(source => source.error).map(source => source.source).join(', ')}.</p>
                    )}
                    {contextSearchResult.matches.length ? (
                      <div className="context-result-list">
                        {contextSearchResult.matches.map(match => (
                          <article className="context-result-card" key={match.plate}>
                            <div className="context-result-topline">
                              <div>
                                <h3>{match.plate}</h3>
                                <span>{match.sources.length} source{match.sources.length === 1 ? '' : 's'} contributed records</span>
                              </div>
                              <button type="button" onClick={() => { setActivePage('search'); setPlate(match.plate); runSearch(match.plate) }}>Open full vehicle lookup</button>
                            </div>
                            <div className="context-result-evidence">
                              {match.matchedContext.map(item => (
                                <div className="context-result-clue" key={item.field}>
                                  <b>{readableFieldName(item.field)} contains “{item.query}”</b>
                                  <span>{item.evidence.map(evidence => `${evidence.source}: ${evidence.value}`).join(' · ')}</span>
                                </div>
                              ))}
                            </div>
                            <details className="context-source-records">
                              <summary>View matching database records ({match.sourceRecords.length})</summary>
                              <div className="context-source-record-list">
                                {match.sourceRecords.map((record, index) => (
                                  <div className="context-source-record" key={`${record.source}-${index}`}>
                                    <strong>{record.source}</strong>
                                    <span>{Object.entries(record.fields).filter(([, value]) => value !== null && value !== undefined && value !== '').map(([field, value]) => `${readableFieldName(field)}: ${formatContextValue(value)}`).join(' · ')}</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="context-search-empty">No vehicle records matched the interpreted context. Try a different sentence or broaden the clues.</p>
                    )}
                    {contextSearchResult.totalMatches > contextSearchResult.limit && (
                      <p className="context-search-status">Showing the first {contextSearchResult.limit} of {contextSearchResult.totalMatches} matches.</p>
                    )}
                  </div>
                )}
            </section>
          )}

          {activePage === 'search' && (
            <>

              {/* HEADER */}

              <header className="header">
                <h1>Vehicle Intelligence System</h1>
                <p>
                  Federated lookup and close plate matching across 5 databases
                </p>
              </header>


              {/* SEARCH */}

              <form
                className="search-box"
                onSubmit={handleSearch}
              >
                <input
                  type="text"
                  placeholder="Enter vehicle plate (e.g. DL01AB1234)"
                  value={plate}
                  onChange={(e) =>
                    setPlate(e.target.value.toUpperCase())
                  }
                  disabled={loading || matching}
                />

                <button
                  type="submit"
                  disabled={loading || matching || !plate.trim()}
                >
                  {loading || matching ? 'Searching...' : 'Search'}
                </button>
                <div className="search-context-fields">
                  <input aria-label="Vehicle make clue" placeholder="Make (optional)" value={make} onChange={e => setMake(e.target.value)} />
                  <input aria-label="Vehicle model clue" placeholder="Model (optional)" value={model} onChange={e => setModel(e.target.value)} />
                  <input aria-label="Vehicle color clue" placeholder="Color (optional)" value={color} onChange={e => setColor(e.target.value)} />
                </div>
              </form>



              {algorithm && (
                <details className="ocr-algorithm">
                  <summary>How close plate matches are ranked</summary>
                  <p><strong>{algorithm.name}.</strong> {algorithm.plateRules} {algorithm.candidateGate} {algorithm.ranking}</p>
                </details>
              )}

              {matching && <p className="muted">Finding close plate matches…</p>}
              {result && !matching && candidates.length === 0 && (
                <p className="muted">No close plate matches found. Check the plate or add make, model, or color clues.</p>
              )}

              {candidates.length > 0 && (
                <section className="ocr-candidates">
                  <div className="ocr-section-heading">
                    <div>
                      <h2>Close plate matches</h2>
                      <p>Review candidates and open the correct vehicle record.</p>
                    </div>
                    <span>{candidates.length} candidates</span>
                  </div>
                  <div className="ocr-candidate-list">
                    {candidates.map(candidate => (
                      <div className="ocr-candidate" key={candidate.plate}>
                        <span className="ocr-candidate-topline">
                          <strong>{candidate.plate}</strong>
                          <span>{candidate.score}% rank score</span>
                        </span>
                        <span className="ocr-candidate-details">
                          Plate similarity {candidate.plateSimilarity}% · Levenshtein distance {candidate.plateDistance}
                        </span>
                        <span className="ocr-candidate-details">
                          {[candidate.registration?.make, candidate.registration?.model, candidate.registration?.year, candidate.camera?.color].filter(Boolean).join(' | ') || 'No vehicle context recorded'}
                        </span>
                        <span className="ocr-source-list">
                          {candidate.sourceRecords.map(source => <span key={source}>{source.replace(/^DB\d_/, '').replace(/([A-Z])/g, ' $1').trim()}</span>)}
                        </span>
                        <button type="button" onClick={() => { setPlate(candidate.plate); runSearch(candidate.plate) }}>
                          Open this vehicle
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

            
              {/* =========================
                  ERROR
              ========================= */}

              {error && (
                <div className="error-box">
                  {error}
                </div>
              )}

            
              {/* =========================
                  RESULTS
              ========================= */}

              {result && (
                <div className="results">
                
                  {/* OVERALL STATUS */}
              
                  <div
                    className="status-card"
                    style={{
                      borderLeftColor: getStatusColor(
                        result.profile?.overall_status
                      ),
                    }}
                  >
                  
                    <h2>
                      {result.profile?.plate || plate}
                    </h2>
                  
                    <span
                      className="badge"
                      style={{
                        background: getStatusColor(
                          result.profile?.overall_status
                        ),
                      }}
                    >
                      {result.profile?.overall_status || 'Unknown'}
                    </span>
                    
                    {result.meta?.total_latency && (
                      <small>
                        Total latency: {result.meta.total_latency}
                      </small>
                    )}

                  </div>

                  <section className="query-context-panel" aria-labelledby="query-context-title">
                    <div className="query-panel-heading">
                      <div>
                        <h3 id="query-context-title"><i className="fas fa-diagram-project"></i> Structured context gathered</h3>
                        <p>Evidence discovered across source relationships for {result.context?.query?.normalizedPlate || result.profile?.plate || plate}.</p>
                      </div>
                      <span className="query-panel-count">{result.context?.signals?.length || 0} context signals</span>
                    </div>
                    {result.context?.bySource?.length ? (
                      <div className="query-context-grid">
                        {result.context.bySource.map(source => (
                          <article className={`query-context-source ${source.found ? 'found' : 'not-found'}`} key={source.source}>
                            <div className="query-context-source-heading">
                              <strong>{source.source}</strong>
                              <span>{source.found ? 'Context found' : source.error ? 'Source error' : 'No record'}</span>
                            </div>
                            {source.error && <p className="query-source-error">{source.error}</p>}
                            {source.signals?.length ? (
                              <dl className="query-context-signals">
                                {source.signals.map(signal => (
                                  <div className="query-context-signal" key={`${signal.field}-${formatContextValue(signal.value)}`}>
                                    <dt>{readableFieldName(signal.field)}</dt>
                                    <dd>{formatContextValue(signal.value)}</dd>
                                  </div>
                                ))}
                              </dl>
                            ) : (
                              <p className="query-context-empty">No structured context returned.</p>
                            )}
                            {source.entityIds && Object.keys(source.entityIds).length > 0 && (
                              <details className="query-context-ids">
                                <summary>Linked entity IDs</summary>
                                <div className="query-context-id-list">
                                  {Object.entries(source.entityIds).map(([name, id]) => (
                                    <span key={name}><b>{name}</b> {String(id)}</span>
                                  ))}
                                </div>
                              </details>
                            )}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="query-context-empty">No context was returned. Try the lookup again.</p>
                    )}
                  </section>

                  <section className="unstructured-panel" aria-labelledby="unstructured-title">
                    <div className="query-panel-heading">
                      <div>
                        <h3 id="unstructured-title"><i className="fas fa-file-lines"></i> Context-matched case notes</h3>
                        <p>Unstructured notes ranked against the gathered vehicle and camera context.</p>
                      </div>
                      {result.unstructuredSearch && (
                        <span className="query-panel-count">{result.unstructuredSearch.matches?.length || 0} relevant notes</span>
                      )}
                    </div>
                    {result.unstructuredSearch?.error ? (
                      <p className="unstructured-empty error-text">Note search failed: {result.unstructuredSearch.error}</p>
                    ) : result.unstructuredSearch?.matches?.length ? (
                      <div className="unstructured-match-list">
                        {result.unstructuredSearch.matches.map((match, index) => (
                          <article className="unstructured-match" key={match.sourceIds?.update || `${match.case?.firNumber || 'case'}-${index}`}>
                            <div className="unstructured-match-heading">
                              <strong>{match.case?.firNumber || 'Case note'}</strong>
                              <span>Relevance rank {match.relevanceScore}/100 · not a probability</span>
                            </div>
                            <blockquote>{match.note}</blockquote>
                            <div className="unstructured-match-meta">
                              <span><b>Vehicle:</b> {match.vehicle?.plate || 'Unknown plate'}{match.vehicle?.make ? ` · ${match.vehicle.make} ${match.vehicle.model || ''}` : ''}</span>
                              <span><b>Case:</b> {match.case?.status || match.updateStatus || 'Status unavailable'}{match.case?.policeStation ? ` · ${match.case.policeStation}` : ''}</span>
                              {match.updatedAt && <span><b>Updated:</b> {new Date(match.updatedAt).toLocaleString()}</span>}
                              <span><b>Match basis:</b> {match.plateMatch ? 'exact plate in note' : 'shared context terms'}</span>
                            </div>
                            {match.matchedTerms?.length > 0 && (
                              <div className="matched-context-terms">
                                <b>Matched context:</b>
                                {match.matchedTerms.map(term => <span key={term}>{term}</span>)}
                              </div>
                            )}
                            <small className="unstructured-source">Source: {match.source}</small>
                          </article>
                        ))}
                      </div>
                    ) : result.unstructuredSearch ? (
                      <p className="unstructured-empty">No relevant unstructured case notes found for this plate and context. Scanned {result.unstructuredSearch.candidatesScanned || 0} notes from {result.unstructuredSearch.source}.</p>
                    ) : (
                      <p className="unstructured-empty">No note-search result was returned. Run a fresh lookup to populate it.</p>
                    )}
                  </section>
                  
                  
                  {/* =========================
                      DATABASE CARDS
                  ========================= */}

                  <div className="grid">
                  
                    {/* REGISTRATION */}
                  
                    <div className="card">
                  
                      <h3>
                        <i className="fas fa-id-card"></i>
                        Registration (RTO)
                      </h3>
                  
                      {result.profile?.registered ? (
                      
                        <ul>
                        
                          <li>
                            <strong>Owner:</strong>{' '}
                            {result.profile.owner}
                          </li>
                      
                          <li>
                            <strong>Make/Model:</strong>{' '}
                            {result.profile.vehicle_make}{' '}
                            {result.profile.vehicle_model}
                          </li>
                      
                          <li>
                            <strong>Year:</strong>{' '}
                            {result.profile.year_of_manufacture}
                          </li>
                      
                          <li>
                            <strong>Fuel:</strong>{' '}
                            {result.profile.fuel_type}
                          </li>
                      
                          <li>
                            <strong>Reg Date:</strong>{' '}
                            {result.profile.registration_date?.slice?.(0, 10)}
                          </li>
                      
                        </ul>

                      ) : (
                      
                        <p className="muted">
                          No registration found
                        </p>

                      )}

                    </div>
                    
                    
                    {/* INSURANCE */}
                    
                    <div className="card">
                    
                      <h3>
                        <i className="fas fa-shield-halved"></i>
                        Insurance
                      </h3>
                    
                      {result.profile?.insurance_status !== 'uninsured' ? (
                      
                        <ul>
                        
                          <li>
                            <strong>Company:</strong>{' '}
                            {result.profile.insurer}
                          </li>
                      
                          <li>
                            <strong>Type:</strong>{' '}
                            {result.profile.policy_type}
                          </li>
                      
                          <li>
                            <strong>Status:</strong>{' '}
                            {result.profile.insurance_status}
                          </li>
                      
                          <li>
                            <strong>Expiry:</strong>{' '}
                            {result.profile.insurance_expiry?.slice?.(0, 10)}
                          </li>
                      
                          <li>
                            <strong>Premium:</strong>{' '}
                            ₹{result.profile.premium_amount}
                          </li>
                      
                        </ul>

                      ) : (
                      
                        <p className="muted">
                          No insurance record (Uninsured)
                        </p>

                      )}

                    </div>
                    
                    
                    {/* CAMERA */}
                    
                    <div className="card">
                    
                      <h3>
                        <i className="fas fa-camera"></i>
                        Latest Sighting (Camera)
                      </h3>
                    
                      {result.profile?.sighted_at ? (
                      
                        <ul>
                        
                          <li>
                            <strong>Location:</strong>{' '}
                            {result.profile.sighted_at}
                          </li>
                      
                          <li>
                            <strong>Camera:</strong>{' '}
                            {result.profile.camera_id}
                          </li>
                      
                          <li>
                            <strong>Color:</strong>{' '}
                            {result.profile.vehicle_color}
                          </li>
                      
                          <li>
                            <strong>Type:</strong>{' '}
                            {result.profile.vehicle_type}
                          </li>
                      
                          <li>
                            <strong>Time:</strong>{' '}
                            {result.profile.sighted_when
                              ? new Date(result.profile.sighted_when).toLocaleString()
                              : 'Not recorded'}
                          </li>
                          
                        </ul>

                      ) : (
                      
                        <p className="muted">
                          No recent sighting
                        </p>

                      )}

                    </div>
                    
                    
                    {/* THEFT */}
                    
                    <div className="card">
                    
                      <h3>
                        <i className="fas fa-triangle-exclamation"></i>
                        Theft Status
                      </h3>
                    
                      {result.profile?.stolen ? (
                      
                        <ul>
                        
                          <li>
                            <strong>Status:</strong>{' '}
                            {result.profile.theft_status}
                          </li>
                      
                          <li>
                            <strong>FIR:</strong>{' '}
                            {result.profile.fir_number}
                          </li>
                      
                          <li>
                            <strong>Station:</strong>{' '}
                            {result.profile.police_station}
                          </li>
                      
                          <li>
                            <strong>Reported:</strong>{' '}
                            {new Date(
                              result.profile.theft_reported
                            ).toLocaleDateString()}
                          </li>
                          
                        </ul>

                      ) : (
                      
                        <p className="muted">
                          No theft record
                        </p>

                      )}

                    </div>
                    
                    
                    {/* MOT */}
                    
                    <div className="card">
                    
                      <h3>
                        <i className="fas fa-screwdriver-wrench"></i>
                        MOT Report
                      </h3>
                    
                      {result.profile?.mot_flagged ? (
                      
                        <ul>
                        
                          <li>
                            <strong>Type:</strong>{' '}
                            {result.profile.mot_flagged}
                          </li>
                      
                          <li>
                            <strong>Action:</strong>{' '}
                            {result.profile.mot_action}
                          </li>
                      
                          <li>
                            <strong>Resolved:</strong>{' '}
                            {result.profile.mot_resolved
                              ? 'Yes'
                              : 'No'}
                          </li>
                            
                          <li>
                            <strong>Date:</strong>{' '}
                            {new Date(
                              result.profile.mot_report_date
                            ).toLocaleString()}
                          </li>
                          
                        </ul>

                      ) : (
                      
                        <p className="muted">
                          No MOT report
                        </p>

                      )}

                    </div>
                    
                  </div>
                    
                    
                  {/* =========================
                      SOURCE BREAKDOWN
                  ========================= */}

                  {result.meta?.source_latencies && (
                  
                    <div className="sources">
                    
                      <h3>
                        <i className="fas fa-database"></i>
                        Data Sources
                      </h3>
                  
                      <div className="source-list">
                  
                        {result.meta.source_latencies.map(
                          (s, i) => (
                          
                            <div
                              key={i}
                              className={`source ${
                                s.found
                                  ? 'found'
                                  : 'missing'
                              }`}
                            >
                            
                              <span>
                                {s.source}
                              </span>
                            
                              <span>
                                {s.found
                                  ? `Found (${s.latency})`
                                  : 'Not found'}
                              </span>
                                
                            </div>

                          )
                        )}

                      </div>
                      
                    </div>

                  )}

                </div>
              )}
          </>
        )}
      </main>

    </div>
  )
}

export default App
