const { Pool } = require('pg')

const insurancePool = new Pool({
  host:     process.env.PG_INSURANCE_HOST,
  port:     process.env.PG_INSURANCE_PORT,
  user:     process.env.PG_INSURANCE_USER,
  password: process.env.PG_INSURANCE_PASSWORD,
  database: process.env.PG_INSURANCE_DB,
})

const motPool = new Pool({
  host:     process.env.PG_MOT_HOST,
  port:     process.env.PG_MOT_PORT,
  user:     process.env.PG_MOT_USER,
  password: process.env.PG_MOT_PASSWORD,
  database: process.env.PG_MOT_DB,
})

async function ensureInsuranceSchema() {
  await insurancePool.query(`
    CREATE TABLE IF NOT EXISTS insurance_records (
      id SERIAL PRIMARY KEY,
      reg_no VARCHAR(20) NOT NULL,
      owner_name VARCHAR(255),
      insurer_company VARCHAR(255),
      policy_type VARCHAR(50),
      start_date DATE,
      expiry_date DATE,
      is_active BOOLEAN,
      premium_amount NUMERIC
    );
  `)
  await insurancePool.query(`CREATE INDEX IF NOT EXISTS idx_insurance_reg_no ON insurance_records(reg_no);`)
}

async function ensureMotSchema() {
  await motPool.query(`
    CREATE TABLE IF NOT EXISTS mot_reports (
      id SERIAL PRIMARY KEY,
      vehicle_number VARCHAR(20) NOT NULL,
      report_date TIMESTAMP,
      report_type VARCHAR(50),
      generated_by VARCHAR(100),
      camera_ref VARCHAR(50),
      action_taken TEXT,
      resolved BOOLEAN DEFAULT FALSE,
      remarks TEXT
    );
  `)
  await motPool.query(`CREATE INDEX IF NOT EXISTS idx_mot_vehicle_number ON mot_reports(vehicle_number);`)
}

async function connectPostgres() {
  await insurancePool.query('SELECT 1')
  await ensureInsuranceSchema()
  console.log('[DB2] PostgreSQL insurancedb connected + schema ready')

  await motPool.query('SELECT 1')
  await ensureMotSchema()
  console.log('[DB5] PostgreSQL motdb connected + schema ready')
}

module.exports = { insurancePool, motPool, connectPostgres }