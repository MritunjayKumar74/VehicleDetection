require('dotenv').config()
const { faker } = require('@faker-js/faker')

const { connectMongo, getCameraDb, getTheftDb } = require('./connectors/mongo')
const { insurancePool, motPool, connectPostgres } = require('./connectors/postgres')
const { connectMySQL, getRtoPool } = require('./connectors/mysql')

const CameraSightingSchema = require('./models/CameraSighting').schema
const TheftRecordSchema    = require('./models/TheftRecord').schema

const cars = [
  { make: 'Maruti Suzuki', models: ['Swift', 'Baleno', 'Brezza', 'Alto'] },
  { make: 'Hyundai',       models: ['Creta', 'i20', 'Verna', 'Venue'] },
  { make: 'Tata',          models: ['Nexon', 'Harrier', 'Punch', 'Altroz'] },
  { make: 'Honda',         models: ['City', 'Amaze', 'WRV'] },
  { make: 'Kia',           models: ['Seltos', 'Sonet', 'Carens'] },
]

const stateCodes  = ['DL', 'HR', 'MH', 'UP', 'RJ', 'KA', 'GJ', 'TN', 'PB', 'MP']
const colors      = ['White', 'Black', 'Silver', 'Red', 'Blue', 'Grey', 'Brown']
const fuelTypes   = ['Petrol', 'Diesel', 'CNG', 'Electric']
const insurers    = ['HDFC Ergo', 'New India Assurance', 'Bajaj Allianz', 'ICICI Lombard', 'Tata AIG']
const policyTypes = ['Comprehensive', 'Third-party']
const cameras     = ['CAM-01', 'CAM-02', 'CAM-03', 'CAM-07', 'CAM-12', 'CAM-15', 'CAM-22']
const locations   = [
  'NH-44 Panipat Toll', 'NH-48 Gurugram Toll', 'Ring Road Delhi Cam-7',
  'Yamuna Expressway', 'Jaipur NH-48', 'Bengaluru ORR', 'Mumbai Andheri Flyover'
]
const stations = ['Noida Sec-20 PS', 'Delhi Saket PS', 'Gurugram City PS', 'Jaipur Central PS']

function randomPlate() {
  const state  = faker.helpers.arrayElement(stateCodes)
  const dist   = faker.number.int({ min: 1, max: 99 }).toString().padStart(2, '0')
  const series = faker.string.alpha({ length: 2, casing: 'upper' })
  const num    = faker.number.int({ min: 1000, max: 9999 })
  return `${state}${dist}${series}${num}`
}

async function seed() {
  console.log('Connecting to all 5 data sources...')
  await connectMongo()
  await connectPostgres()
  await connectMySQL()

  const CameraSighting = getCameraDb().model('CameraSighting', CameraSightingSchema)
  const TheftRecord    = getTheftDb().model('TheftRecord', TheftRecordSchema)
  const rtoPool        = getRtoPool()

  // ── Clear existing data across all 5 sources ─────────────────
  await CameraSighting.deleteMany({})
  await TheftRecord.deleteMany({})
  await insurancePool.query('DELETE FROM insurance_records')
  await motPool.query('DELETE FROM mot_reports')
  await rtoPool.query('DELETE FROM vehicle_registrations')
  console.log('Cleared existing data')

  const plates = Array.from({ length: 40 }, randomPlate)

  for (const plate of plates) {
    const car     = faker.helpers.arrayElement(cars)
    const model   = faker.helpers.arrayElement(car.models)
    const owner   = faker.person.fullName()
    const regDate = faker.date.between({ from: '2015-01-01', to: '2023-12-31' })

    const roll = Math.random()
    const status = roll < 0.65 ? 'clear'
                 : roll < 0.80 ? 'uninsured'
                 : roll < 0.92 ? 'expired'
                 : 'stolen'

    // DB1 — Camera (MongoDB cameradb)
    await CameraSighting.create({
      plate_number: plate,
      capture_timestamp: faker.date.recent({ days: 30 }),
      camera_id: faker.helpers.arrayElement(cameras),
      location: faker.helpers.arrayElement(locations),
      vehicle_color: faker.helpers.arrayElement(colors),
      vehicle_type: faker.helpers.arrayElement(['Sedan', 'SUV', 'Hatchback', 'Truck'])
    })

    // DB3 — RTO Registration (MySQL rtodb)
    await rtoPool.query(
      `INSERT INTO vehicle_registrations
        (vehicle_reg_number, owner_name, owner_address, owner_contact, registration_date,
         vehicle_make, vehicle_model, year_of_manufacture, engine_number, chassis_number, fuel_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        plate,
        owner,
        faker.location.streetAddress() + ', ' + faker.location.city(),
        '9' + faker.string.numeric(9),
        regDate,
        car.make,
        model,
        faker.number.int({ min: 2015, max: 2023 }),
        faker.string.alphanumeric(12).toUpperCase(),
        faker.string.alphanumeric(17).toUpperCase(),
        faker.helpers.arrayElement(fuelTypes)
      ]
    )

    // DB2 — Insurance (PostgreSQL insurancedb) — skip if uninsured
    if (status !== 'uninsured') {
      const insStart  = new Date(regDate)
      const insExpiry = new Date(insStart)

      if (status === 'expired') {
        insStart.setFullYear(insStart.getFullYear() - 2)
        insExpiry.setFullYear(insExpiry.getFullYear() - 1)
      } else {
        insExpiry.setFullYear(new Date().getFullYear() + 1)
      }

      await insurancePool.query(
        `INSERT INTO insurance_records
          (reg_no, owner_name, insurer_company, policy_type, start_date, expiry_date, is_active, premium_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          plate,
          owner,
          faker.helpers.arrayElement(insurers),
          faker.helpers.arrayElement(policyTypes),
          insStart,
          insExpiry,
          status === 'clear' || status === 'stolen',
          faker.number.int({ min: 4000, max: 25000 })
        ]
      )
    }

    // DB4 — Theft (MongoDB theftdb) — only stolen
    if (status === 'stolen') {
      await TheftRecord.create({
        number_plate: plate,
        status: 'stolen',
        reported_date: faker.date.recent({ days: 60 }),
        fir_number: 'FIR/' + new Date().getFullYear() + '/' + faker.string.numeric(5),
        police_station: faker.helpers.arrayElement(stations),
        shredded_by: null,
        shredding_date: null,
        remarks: 'Vehicle reported stolen by owner'
      })
    }

    // DB5 — MOT Reports (PostgreSQL motdb) — non-clear vehicles
    if (status !== 'clear') {
      const typeMap = {
        uninsured: 'uninsured',
        expired:   'expired_insurance',
        stolen:    'stolen_sighting'
      }
      const actionMap = {
        uninsured: 'Challan issued, owner notified',
        expired:   'Notice sent to owner',
        stolen:    'Alert sent to nearest patrol unit'
      }
      await motPool.query(
        `INSERT INTO mot_reports
          (vehicle_number, report_date, report_type, generated_by, camera_ref, action_taken, resolved, remarks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          plate,
          new Date(),
          typeMap[status],
          'AutoSystem',
          faker.helpers.arrayElement(cameras),
          actionMap[status],
          false,
          ''
        ]
      )
    }
  }

  console.log('Seeded 40 vehicles successfully')
  console.log('~65% clear, ~15% uninsured, ~12% expired, ~8% stolen')

  process.exit(0)
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})