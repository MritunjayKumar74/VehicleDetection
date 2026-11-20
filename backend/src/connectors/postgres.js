const { Pool } = require('pg')

const insurancePool = new Pool({ host: process.env.PG_INSURANCE_HOST, port: process.env.PG_INSURANCE_PORT, user: process.env.PG_INSURANCE_USER, password: process.env.PG_INSURANCE_PASSWORD, database: process.env.PG_INSURANCE_DB })
const motPool = new Pool({ host: process.env.PG_MOT_HOST, port: process.env.PG_MOT_PORT, user: process.env.PG_MOT_USER, password: process.env.PG_MOT_PASSWORD, database: process.env.PG_MOT_DB })

async function ensureInsuranceSchema() {
  // Legacy table remains for Phase 2 matching, reconciliation, and editor routes.
  await insurancePool.query(`CREATE TABLE IF NOT EXISTS insurance_records (
    id SERIAL PRIMARY KEY, reg_no VARCHAR(20) NOT NULL, owner_name VARCHAR(255),
    insurer_company VARCHAR(255), policy_type VARCHAR(50), start_date DATE,
    expiry_date DATE, is_active BOOLEAN, premium_amount NUMERIC
  )`)
  await insurancePool.query('CREATE INDEX IF NOT EXISTS idx_insurance_reg_no ON insurance_records(reg_no)')
  await insurancePool.query(`CREATE TABLE IF NOT EXISTS insurers (
    insurer_id SERIAL PRIMARY KEY, insurer_name VARCHAR(255) NOT NULL UNIQUE, contact_email VARCHAR(255)
  )`)
  await insurancePool.query(`CREATE TABLE IF NOT EXISTS coverage_types (
    coverage_type_id SERIAL PRIMARY KEY, type_name VARCHAR(80) NOT NULL UNIQUE, description TEXT
  )`)
  await insurancePool.query(`CREATE TABLE IF NOT EXISTS insurance_policies (
    policy_id SERIAL PRIMARY KEY, reg_no VARCHAR(20) NOT NULL, owner_name VARCHAR(255),
    insurer_id INT NOT NULL REFERENCES insurers(insurer_id),
    coverage_type_id INT NOT NULL REFERENCES coverage_types(coverage_type_id),
    start_date DATE, expiry_date DATE, is_active BOOLEAN, premium_amount NUMERIC
  )`)
  await insurancePool.query(`CREATE TABLE IF NOT EXISTS policy_renewals (
    renewal_id SERIAL PRIMARY KEY, policy_id INT NOT NULL REFERENCES insurance_policies(policy_id) ON DELETE CASCADE,
    renewal_date DATE NOT NULL, previous_expiry DATE, new_expiry DATE NOT NULL, premium_amount NUMERIC
  )`)
  await insurancePool.query(`CREATE TABLE IF NOT EXISTS insurance_claims (
    claim_id SERIAL PRIMARY KEY, policy_id INT NOT NULL REFERENCES insurance_policies(policy_id) ON DELETE CASCADE,
    claim_date DATE NOT NULL, claim_status VARCHAR(40) NOT NULL, description TEXT
  )`)
  await insurancePool.query('CREATE INDEX IF NOT EXISTS idx_policies_reg_no ON insurance_policies(reg_no)')
}

async function ensureMotSchema() {
  // Legacy table remains for Phase 2 code paths.
  await motPool.query(`CREATE TABLE IF NOT EXISTS mot_reports (
    id SERIAL PRIMARY KEY, vehicle_number VARCHAR(20) NOT NULL, report_date TIMESTAMP,
    report_type VARCHAR(50), generated_by VARCHAR(100), camera_ref VARCHAR(50),
    action_taken TEXT, resolved BOOLEAN DEFAULT FALSE, remarks TEXT
  )`)
  await motPool.query('CREATE INDEX IF NOT EXISTS idx_mot_vehicle_number ON mot_reports(vehicle_number)')
  await motPool.query(`CREATE TABLE IF NOT EXISTS inspection_centres (
    centre_id SERIAL PRIMARY KEY, centre_name VARCHAR(255) NOT NULL UNIQUE, location TEXT
  )`)
  await motPool.query(`CREATE TABLE IF NOT EXISTS mot_vehicles (
    vehicle_id SERIAL PRIMARY KEY, vehicle_number VARCHAR(20) NOT NULL, make VARCHAR(100), model VARCHAR(100)
  )`)
  await motPool.query(`CREATE TABLE IF NOT EXISTS mot_tests (
    test_id SERIAL PRIMARY KEY, vehicle_id INT NOT NULL REFERENCES mot_vehicles(vehicle_id) ON DELETE CASCADE,
    centre_id INT REFERENCES inspection_centres(centre_id), report_date TIMESTAMP,
    report_type VARCHAR(50), generated_by VARCHAR(100), result VARCHAR(40)
  )`)
  await motPool.query(`CREATE TABLE IF NOT EXISTS mot_defects (
    defect_id SERIAL PRIMARY KEY, test_id INT NOT NULL REFERENCES mot_tests(test_id) ON DELETE CASCADE,
    severity VARCHAR(40), description TEXT NOT NULL
  )`)
  await motPool.query(`CREATE TABLE IF NOT EXISTS mot_actions (
    action_id SERIAL PRIMARY KEY, test_id INT NOT NULL REFERENCES mot_tests(test_id) ON DELETE CASCADE,
    action_taken TEXT, resolved BOOLEAN DEFAULT FALSE, resolved_at TIMESTAMP
  )`)
  await motPool.query('CREATE INDEX IF NOT EXISTS idx_mot_vehicles_number ON mot_vehicles(vehicle_number)')
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
