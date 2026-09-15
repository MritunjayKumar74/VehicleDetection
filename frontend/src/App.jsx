import { useState, useEffect } from 'react'
import './App.css'
import Dashboard from './components/Dashboard'
import SchemaMapping from './components/SchemaMapping'
import DatabaseEditor from './components/DatabaseEditor'

function App() {
  const [plate, setPlate] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])
  const [activePage, setActivePage] = useState('dashboard')

  const fetchHistory = async () => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/vehicle/history/recent?limit=10`
      )

      const data = await res.json()
      setHistory(data.history || [])
    } catch (err) {
      console.error('Failed to load history', err)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [])

  const handleSearch = async (e) => {
    e.preventDefault()

    if (!plate.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/vehicle/${plate.trim().toUpperCase()}`
      )

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Lookup failed')
      }

      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      await fetchHistory()
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
          
        </nav>

      </aside>


      {/* =========================
          MAIN CONTENT
      ========================= */}

      <main className="main-content">
          {activePage === 'dashboard' && (
            <Dashboard />
          )}
          
          {activePage === 'schema' && (
            <SchemaMapping />  
          )}

          {activePage === 'db-editor' && (
            <DatabaseEditor />
          )}

          {activePage === 'search' && (
            <>

              {/* HEADER */}

              <header className="header">
                <h1>Vehicle Intelligence System</h1>
                <p>
                  Federated lookup across 5 independent databases
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
                  disabled={loading}
                />

                <button
                  type="submit"
                  disabled={loading || !plate.trim()}
                >
                  {loading ? 'Searching...' : 'Search'}
                </button>
              </form>
                
                
              {/* =========================
                  RECENT SEARCHES
              ========================= */}

              {history.length > 0 && (
                <div className="history-section">
                
                  <h2>Recent Searches</h2>
              
                  <div className="history-list">
              
                    {history.map((h, index) => (
                    
                      <div
                        className="history-item"
                        key={`${h.plate}-${h.searched_at}-${index}`}
                      >
                      
                        <div className="history-info">
                    
                          <span className="history-plate">
                            {h.plate}
                          </span>
                    
                          <span className="history-time">
                            {new Date(
                              h.searched_at
                            ).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          
                        </div>
                          
                        <span
                          className={`history-status ${h.overall_status
                            ?.toLowerCase()
                            .replace(/\s+/g, '-')}`}
                        >
                          {h.overall_status}
                        </span>
                          
                      </div>

                    ))}

                  </div>
                  
                </div>
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
                            {new Date(
                              result.profile.sighted_when
                            ).toLocaleString()}
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