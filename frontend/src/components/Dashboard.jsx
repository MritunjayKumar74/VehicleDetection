import { useEffect, useState } from 'react'
import './Dashboard.css'

function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = async () => {
    try {
      const res = await fetch(
        'http://localhost:5000/api/vehicle/dashboard/stats'
      )

      const data = await res.json()
      setStats(data)
    } catch (err) {
      console.error('Failed to load dashboard stats', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>
  }

  const getStatusCount = (status) => {
    const item = stats?.byStatus?.find(
      s => s._id?.toLowerCase() === status
    )

    return item?.count || 0
  }

  return (
    <div className="dashboard">

      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p>Vehicle Intelligence System Overview</p>
        </div>
      </div>

      {/* Statistics */}
      <div className="dashboard-stats">

        <div className="stat-card">
          <div className="stat-icon">
            <i className="fas fa-car"></i>
          </div>

          <div>
            <span className="stat-label">Indexed Vehicles</span>
            <strong>{stats?.total || 0}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <i className="fas fa-circle-check"></i>
          </div>

          <div>
            <span className="stat-label">Clear</span>
            <strong>{getStatusCount('clear')}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <i className="fas fa-shield-halved"></i>
          </div>

          <div>
            <span className="stat-label">Uninsured</span>
            <strong>{getStatusCount('uninsured')}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <i className="fas fa-triangle-exclamation"></i>
          </div>

          <div>
            <span className="stat-label">Stolen</span>
            <strong>{getStatusCount('stolen')}</strong>
          </div>
        </div>

      </div>

      {/* System Overview */}
      <div className="dashboard-grid">

        <div className="dashboard-panel">
          <h2>
            <i className="fas fa-database"></i>
            Integrated Data Sources
          </h2>

          <div className="data-source-list">

            <div className="data-source">
              <div>
                <strong>DB1 — Camera Sightings</strong>
                <span>MongoDB</span>
              </div>

              <span className="source-status">Connected</span>
            </div>

            <div className="data-source">
              <div>
                <strong>DB2 — Insurance Records</strong>
                <span>PostgreSQL</span>
              </div>

              <span className="source-status">Connected</span>
            </div>

            <div className="data-source">
              <div>
                <strong>DB3 — Vehicle Registration</strong>
                <span>MySQL</span>
              </div>

              <span className="source-status">Connected</span>
            </div>

            <div className="data-source">
              <div>
                <strong>DB4 — Theft Records</strong>
                <span>MongoDB</span>
              </div>

              <span className="source-status">Connected</span>
            </div>

            <div className="data-source">
              <div>
                <strong>DB5 — MOT Reports</strong>
                <span>PostgreSQL</span>
              </div>

              <span className="source-status">Connected</span>
            </div>

          </div>
        </div>


        <div className="dashboard-panel">
          <h2>
            <i className="fas fa-layer-group"></i>
            System Architecture
          </h2>

          <div className="architecture">

            <div className="architecture-box">
              <i className="fas fa-globe"></i>
              <span>Vehicle Search</span>
            </div>

            <i className="fas fa-arrow-down"></i>

            <div className="architecture-box">
              <i className="fas fa-network-wired"></i>
              <span>Federated Query Engine</span>
            </div>

            <i className="fas fa-arrow-down"></i>

            <div className="architecture-box">
              <i className="fas fa-database"></i>
              <span>5 Independent Databases</span>
            </div>

            <i className="fas fa-arrow-down"></i>

            <div className="architecture-box">
              <i className="fas fa-object-group"></i>
              <span>Unified Vehicle Profile</span>
            </div>

          </div>
        </div>

      </div>


      {/* Materialized View */}
      <div className="dashboard-panel materialized-panel">

        <h2>
          <i className="fas fa-bolt"></i>
          Materialized View
        </h2>

        <div className="materialized-info">

          <div>
            <span>Cached Vehicles</span>
            <strong>{stats?.total || 0}</strong>
          </div>

          <div>
            <span>Fresh</span>
            <strong>{stats?.fresh || 0}</strong>
          </div>

          <div>
            <span>Stale</span>
            <strong>{stats?.stale || 0}</strong>
          </div>

        </div>

      </div>

    </div>
  )
}

export default Dashboard
