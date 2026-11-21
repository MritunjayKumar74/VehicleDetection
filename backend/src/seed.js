require('dotenv').config()
const { faker } = require('@faker-js/faker')

const { connectMongo, getCameraDb, getTheftDb } = require('./connectors/mongo')
const { insurancePool, motPool, connectPostgres } = require('./connectors/postgres')
const { connectMySQL, getRtoPool } = require('./connectors/mysql')
const { seedPhase3 } = require('./phase3Seeder')

const CameraSightingSchema = require('./models/CameraSighting').schema
const TheftRecordSchema = require('./models/TheftRecord').schema

const cars = [
  { make: 'Maruti Suzuki', models: ['Swift', 'Baleno', 'Brezza', 'Alto'] },
  { make: 'Hyundai', models: ['Creta', 'i20', 'Verna', 'Venue'] },
  { make: 'Tata', models: ['Nexon', 'Harrier', 'Punch', 'Altroz'] },
  { make: 'Honda', models: ['City', 'Amaze', 'WRV'] },
  { make: 'Kia', models: ['Seltos', 'Sonet', 'Carens'] },
]
const stateCodes = ['DL', 'HR', 'MH', 'UP', 'RJ', 'KA', 'GJ', 'TN', 'PB', 'MP']
const colors = ['White', 'Black', 'Silver', 'Red', 'Blue', 'Grey', 'Brown']
const fuelTypes = ['Petrol', 'Diesel', 'CNG', 'Electric']
const insurers = ['HDFC Ergo', 'New India Assurance', 'Bajaj Allianz', 'ICICI Lombard', 'Tata AIG']
const policyTypes = ['Comprehensive', 'Third-party']
const cameras = ['CAM-01', 'CAM-02', 'CAM-03', 'CAM-07', 'CAM-12', 'CAM-15', 'CAM-22']
const locations = ['NH-44 Panipat Toll', 'NH-48 Gurugram Toll', 'Ring Road Delhi Cam-7', 'Yamuna Expressway', 'Jaipur NH-48', 'Bengaluru ORR', 'Mumbai Andheri Flyover']
const stations = ['Noida Sec-20 PS', 'Delhi Saket PS', 'Gurugram City PS', 'Jaipur Central PS']

function randomPlate() {
  const state = faker.helpers.arrayElement(stateCodes)
  const dist = faker.number.int({ min: 1, max: 99 }).toString().padStart(2, '0')
  const series = faker.string.alpha({ length: 2, casing: 'upper' })
  return `${state}${dist}${series}${faker.number.int({ min: 1000, max: 9999 })}`
}

async function seed() {
  console.log('Connecting to all data sources...')
  await connectMongo()
  await connectPostgres()
  await connectMySQL()

  const CameraSighting = getCameraDb().models.CameraSighting || getCameraDb().model('CameraSighting', CameraSightingSchema)
  const TheftRecord = getTheftDb().models.TheftRecord || getTheftDb().model('TheftRecord', TheftRecordSchema)
  const rtoPool = getRtoPool()

  // Clear legacy Phase 2 records. Phase 3 tables are cleared in seedPhase3 after FK-safe setup.
  await CameraSighting.deleteMany({})
  await TheftRecord.deleteMany({})
  await insurancePool.query('DELETE FROM insurance_records')
  await motPool.query('DELETE FROM mot_reports')
  await rtoPool.query('DELETE FROM vehicle_registrations')
  await rtoPool.query('DELETE FROM search_logs')
  console.log('Cleared legacy data')

  const plates = Array.from({ length: 40 }, randomPlate)
  const phase3Rows = []

  for (const plate of plates) {
    const car = faker.helpers.arrayElement(cars)
    const model = faker.helpers.arrayElement(car.models)
    const owner = faker.person.fullName()
    const regDate = faker.date.between({ from: '2015-01-01', to: '2023-12-31' })
    const color = faker.helpers.arrayElement(colors)
    const vehicleType = faker.helpers.arrayElement(['Sedan', 'SUV', 'Hatchback', 'Truck'])
    const cameraCode = faker.helpers.arrayElement(cameras)
    const location = faker.helpers.arrayElement(locations)
    const captureTime = faker.date.recent({ days: 30 })
    const address = `${faker.location.streetAddress()}, ${faker.location.city()}`
    const contact = `9${faker.string.numeric(9)}`
    // Registration must not predate manufacture; both legacy and Phase 3 rows reuse this value.
    const year = faker.number.int({ min: 2015, max: regDate.getFullYear() })
    const engine = faker.string.alphanumeric(12).toUpperCase()
    const chassis = faker.string.alphanumeric(17).toUpperCase()
    const fuel = faker.helpers.arrayElement(fuelTypes)
    const statusRoll = Math.random()
    const status = statusRoll < 0.65 ? 'clear' : statusRoll < 0.80 ? 'uninsured' : statusRoll < 0.92 ? 'expired' : 'stolen'
    const insurer = faker.helpers.arrayElement(insurers)
    const policyType = faker.helpers.arrayElement(policyTypes)
    const premium = faker.number.int({ min: 4000, max: 25000 })
    const insStart = new Date(regDate)
    const insExpiry = new Date(insStart)
    if (status === 'expired') {
      insStart.setFullYear(insStart.getFullYear() - 2)
      insExpiry.setFullYear(insExpiry.getFullYear() - 1)
    } else {
      insExpiry.setFullYear(new Date().getFullYear() + 1)
    }

    // DB1 legacy collection (Phase 2 compatibility).
    await CameraSighting.create({ plate_number: plate, capture_timestamp: captureTime, camera_id: cameraCode, location, vehicle_color: color, vehicle_type: vehicleType })

    // DB3 legacy table (Phase 2 compatibility).
    await rtoPool.query(
      `INSERT INTO vehicle_registrations
        (vehicle_reg_number, owner_name, owner_address, owner_contact, registration_date,
         vehicle_make, vehicle_model, year_of_manufacture, engine_number, chassis_number, fuel_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [plate, owner, address, contact, regDate, car.make, model, year, engine, chassis, fuel]
    )

    // DB2 legacy table (Phase 2 compatibility).
    if (status !== 'uninsured') {
      await insurancePool.query(
        `INSERT INTO insurance_records (reg_no, owner_name, insurer_company, policy_type, start_date, expiry_date, is_active, premium_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [plate, owner, insurer, policyType, insStart, insExpiry, status === 'clear' || status === 'stolen', premium]
      )
    }

    // DB4 legacy collection (Phase 2 compatibility).
    if (status === 'stolen') {
      await TheftRecord.create({ number_plate: plate, status: 'stolen', reported_date: captureTime, fir_number: `FIR/${new Date().getFullYear()}/${faker.string.numeric(5)}`, police_station: faker.helpers.arrayElement(stations), shredded_by: null, shredding_date: null, remarks: `Vehicle reported stolen; last associated area: ${location}` })
    }

    // DB5 legacy table (Phase 2 compatibility).
    let action = null
    if (status !== 'clear') {
      const typeMap = { uninsured: 'uninsured', expired: 'expired_insurance', stolen: 'stolen_sighting' }
      const actionMap = { uninsured: 'Challan issued, owner notified', expired: 'Notice sent to owner', stolen: 'Alert sent to nearest patrol unit' }
      action = actionMap[status]
      await motPool.query(
        `INSERT INTO mot_reports (vehicle_number, report_date, report_type, generated_by, camera_ref, action_taken, resolved, remarks)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [plate, captureTime, typeMap[status], 'AutoSystem', cameraCode, action, false, '']
      )
    }

    phase3Rows.push({ plate, owner, address, contact, regDate, make: car.make, model, year, engine, chassis, fuel, color, vehicleType, cameraCode, location, captureTime, status, insurer, policyType, premium, insStart, insExpiry, action })
  }

  await seedPhase3(phase3Rows)
  console.log('Seeded 40 vehicles successfully into legacy + Phase 3 structures')
  console.log('Status distribution is randomized around the documented proportions')
  process.exit(0)
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
