const mysql = require('mysql2/promise')

let rtoPool

async function ensureRtoSchema() {
  await rtoPool.query(`
    CREATE TABLE IF NOT EXISTS vehicle_registrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vehicle_reg_number VARCHAR(20) NOT NULL,
      owner_name VARCHAR(255),
      owner_address VARCHAR(500),
      owner_contact VARCHAR(20),
      registration_date DATE,
      vehicle_make VARCHAR(100),
      vehicle_model VARCHAR(100),
      year_of_manufacture INT,
      engine_number VARCHAR(50),
      chassis_number VARCHAR(50),
      fuel_type VARCHAR(20),
      INDEX idx_vehicle_reg_number (vehicle_reg_number)
    );
  `)
}

async function connectMySQL() {
  rtoPool = await mysql.createPool({
    host:     process.env.MYSQL_HOST,
    port:     process.env.MYSQL_PORT,
    user:     process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB,
    waitForConnections: true,
    connectionLimit: 10,
  })

  await rtoPool.query('SELECT 1')
  await ensureRtoSchema()
  await ensureSearchLogSchema()
  console.log('[DB3] MySQL rtodb connected + schema ready')
}

async function ensureSearchLogSchema() {
  await rtoPool.query(`
    CREATE TABLE IF NOT EXISTS search_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      plate VARCHAR(20) NOT NULL,
      overall_status VARCHAR(50),
      searched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_searched_at (searched_at)
    );
  `)
}

async function logSearch(plate, overall_status) {
  await rtoPool.query(
    'INSERT INTO search_logs (plate, overall_status) VALUES (?, ?)',
    [plate, overall_status]
  )
}

async function getSearchHistory(limit = 10) {
  const [rows] = await rtoPool.query(
    'SELECT plate, overall_status, searched_at FROM search_logs ORDER BY searched_at DESC LIMIT ?',
    [limit]
  )
  return rows
}

function getRtoPool() { return rtoPool }

module.exports = {
  connectMySQL,
  getRtoPool,
  logSearch,
  getSearchHistory
}