const { getCameraDb, getTheftDb } = require('../connectors/mongo')
const { insurancePool, motPool } = require('../connectors/postgres')
const { getRtoPool } = require('../connectors/mysql')
const { parseContextSentence } = require('./contextQueryParser')

const SOURCE_NAMES = [
  'DB1_CameraSightings',
  'DB2_InsuranceRecords',
  'DB3_VehicleRegistration',
  'DB4_TheftRecords',
  'DB5_MotReports',
]
const MAX_SOURCE_ROWS = 5000
const MAX_RESULTS = 50
const MAX_RECORDS_PER_SOURCE_PER_PLATE = 3

function normalizePlate(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function textMatches(value, clue) {
  return value != null && String(value).toLocaleLowerCase().includes(clue.toLocaleLowerCase())
}

function addSourceRecord(groups, source, rawPlate, fields, contextValues) {
  const key = normalizePlate(rawPlate)
  if (!key) return
  if (!groups.has(key)) {
    groups.set(key, {
      plate: String(rawPlate).trim(),
      sourceRecords: [],
      sourceRecordCounts: {},
      values: { location: [], make: [], model: [], color: [], vehicleType: [] },
    })
  }
  const group = groups.get(key)
  const sourceCount = group.sourceRecordCounts[source] || 0
  if (sourceCount < MAX_RECORDS_PER_SOURCE_PER_PLATE) {
    group.sourceRecords.push({ source, fields })
    group.sourceRecordCounts[source] = sourceCount + 1
  }
  for (const [field, value] of Object.entries(contextValues)) {
    if (value != null && String(value).trim()) {
      group.values[field].push({ source, value: String(value).trim() })
    }
  }
}

async function loadSources() {
  const cameraDb = getCameraDb()
  const theftDb = getTheftDb()

  return [
    {
      source: SOURCE_NAMES[0],
      load: async () => cameraDb.collection('p3_camera_sightings').aggregate([
        { $lookup: { from: 'p3_observed_vehicles', localField: 'vehicle_id', foreignField: '_id', as: 'vehicle' } },
        { $unwind: '$vehicle' },
        { $lookup: { from: 'p3_cameras', localField: 'camera_id', foreignField: '_id', as: 'camera' } },
        { $unwind: { path: '$camera', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'p3_locations', localField: 'camera.location_id', foreignField: '_id', as: 'location' } },
        { $unwind: { path: '$location', preserveNullAndEmptyArrays: true } },
        { $sort: { capture_timestamp: -1 } },
        { $limit: MAX_SOURCE_ROWS },
        { $project: {
          plate: '$vehicle.plate_raw',
          fields: {
            location: '$location.name', camera_id: '$camera.camera_code', city: '$location.city',
            vehicle_color: '$vehicle.vehicle_color', vehicle_type: '$vehicle.vehicle_type',
            make: '$vehicle.make', model: '$vehicle.model', capture_timestamp: '$capture_timestamp',
          },
          values: {
            location: '$location.name', color: '$vehicle.vehicle_color',
            vehicleType: '$vehicle.vehicle_type', make: '$vehicle.make', model: '$vehicle.model',
          },
        } },
      ]).toArray(),
    },
    {
      source: SOURCE_NAMES[1],
      load: async () => (await insurancePool.query(`
        SELECT p.reg_no AS plate, i.insurer_name AS insurer_company,
          c.type_name AS policy_type, p.is_active, p.expiry_date
        FROM insurance_policies p
        JOIN insurers i ON i.insurer_id = p.insurer_id
        JOIN coverage_types c ON c.coverage_type_id = p.coverage_type_id
        ORDER BY p.expiry_date DESC NULLS LAST LIMIT ${MAX_SOURCE_ROWS}`)).rows.map(row => ({
        plate: row.plate,
        fields: { insurer_company: row.insurer_company, policy_type: row.policy_type, is_active: row.is_active, expiry_date: row.expiry_date },
        values: {},
      })),
    },
    {
      source: SOURCE_NAMES[2],
      load: async () => (await getRtoPool().query(`
        SELECT reg.vehicle_reg_number AS plate, model.make, model.model_name AS model,
          model.fuel_type, model.vehicle_type, vehicle.year_of_manufacture,
          reg.registration_date
        FROM rto_registrations reg
        JOIN rto_vehicles vehicle ON vehicle.vehicle_id = reg.vehicle_id
        JOIN rto_vehicle_models model ON model.model_id = vehicle.model_id
        JOIN rto_owners rto_owner ON rto_owner.owner_id = reg.owner_id
        ORDER BY reg.registration_date DESC LIMIT ${MAX_SOURCE_ROWS}`))[0].map(row => ({
        plate: row.plate,
        fields: { make: row.make, model: row.model, fuel_type: row.fuel_type, vehicle_type: row.vehicle_type, year_of_manufacture: row.year_of_manufacture, registration_date: row.registration_date },
        values: { make: row.make, model: row.model, vehicleType: row.vehicle_type },
      })),
    },
    {
      source: SOURCE_NAMES[3],
      load: async () => theftDb.collection('p3_case_vehicles').aggregate([
        { $lookup: { from: 'p3_reported_vehicles', localField: 'vehicle_id', foreignField: '_id', as: 'vehicle' } },
        { $unwind: '$vehicle' },
        { $lookup: { from: 'p3_theft_cases', localField: 'case_id', foreignField: '_id', as: 'theftCase' } },
        { $unwind: '$theftCase' },
        { $lookup: { from: 'p3_police_stations', localField: 'theftCase.station_id', foreignField: '_id', as: 'station' } },
        { $unwind: { path: '$station', preserveNullAndEmptyArrays: true } },
        { $sort: { 'theftCase.reported_at': -1 } },
        { $limit: MAX_SOURCE_ROWS },
        { $project: {
          plate: '$vehicle.plate_raw',
          fields: {
            status: '$reported_status', fir_number: '$theftCase.fir_number',
            police_station: '$station.name', reported_at: '$theftCase.reported_at',
            make: '$vehicle.make', model: '$vehicle.model', color: '$vehicle.color',
          },
          values: {
            location: '$station.name', make: '$vehicle.make', model: '$vehicle.model', color: '$vehicle.color',
          },
        } },
      ]).toArray(),
    },
    {
      source: SOURCE_NAMES[4],
      load: async () => (await motPool.query(`
        SELECT vehicle.vehicle_number AS plate, test.report_date, test.report_type,
          centre.centre_name, centre.location, defect_summary.remarks,
          action.action_taken, COALESCE(action.resolved, FALSE) AS resolved
        FROM mot_vehicles vehicle
        JOIN mot_tests test ON test.vehicle_id = vehicle.vehicle_id
        LEFT JOIN inspection_centres centre ON centre.centre_id = test.centre_id
        LEFT JOIN LATERAL (
          SELECT string_agg(defect.description, '; ' ORDER BY defect.defect_id) AS remarks
          FROM mot_defects defect WHERE defect.test_id = test.test_id
        ) defect_summary ON TRUE
        LEFT JOIN LATERAL (
          SELECT action_taken, resolved FROM mot_actions
          WHERE test_id = test.test_id ORDER BY action_id DESC LIMIT 1
        ) action ON TRUE
        ORDER BY test.report_date DESC NULLS LAST LIMIT ${MAX_SOURCE_ROWS}`)).rows.map(row => ({
        plate: row.plate,
        fields: { report_date: row.report_date, report_type: row.report_type, inspection_centre: row.centre_name, location: row.location, remarks: row.remarks, action_taken: row.action_taken, resolved: row.resolved },
        values: { location: row.location },
      })),
    },
  ]
}

async function searchVehiclesByContext(query) {
  const parsed = parseContextSentence(query)
  const filters = parsed.filters
  const definitions = await loadSources()
  const settled = await Promise.allSettled(definitions.map(definition => definition.load()))
  const groups = new Map()
  const sourceStatus = []

  settled.forEach((result, index) => {
    const source = definitions[index].source
    if (result.status === 'rejected') {
      sourceStatus.push({ source, found: false, error: result.reason?.message || 'Source query failed' })
      return
    }
    sourceStatus.push({ source, found: result.value.length > 0, scanned: result.value.length, error: null })
    for (const record of result.value) {
      addSourceRecord(groups, source, record.plate, record.fields, record.values)
    }
  })

  if (sourceStatus.every(source => source.error)) {
    const error = new Error('Context search could not reach any connected database.')
    error.status = 503
    throw error
  }

  const matches = [...groups.values()].flatMap(group => {
    const matchedContext = Object.entries(filters).map(([field, query]) => ({
      field,
      query,
      evidence: group.values[field].filter(item => textMatches(item.value, query)),
    }))
    if (matchedContext.some(item => item.evidence.length === 0)) return []

    return [{
      plate: group.plate,
      sourceRecords: group.sourceRecords,
      sources: [...new Set(group.sourceRecords.map(record => record.source))],
      matchedContext,
    }]
  }).sort((left, right) => right.sources.length - left.sources.length || left.plate.localeCompare(right.plate))

  return {
    query: parsed.sentence,
    parsedFilters: filters,
    filters,
    matchRule: 'Every entered clue must match at least one structured value for the same normalized plate. Text clues use case-insensitive partial matching.',
    sourceStatus,
    totalMatches: matches.length,
    matches: matches.slice(0, MAX_RESULTS),
    limit: MAX_RESULTS,
  }
}

module.exports = { searchVehiclesByContext }
