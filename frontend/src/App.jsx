import { useState } from 'react'
import './App.css'
import Dashboard from './components/Dashboard'
import SchemaMapping from './components/SchemaMapping'
import DatabaseEditor from './components/DatabaseEditor'
import SqlConsole from './components/SqlConsole'
import PlateUpload from './PlateUpload';

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
        fetch(`${import.meta.env.VITE_API_URL}/api/vehicle/${encodeURIComponent(queryPlate)}`),
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
