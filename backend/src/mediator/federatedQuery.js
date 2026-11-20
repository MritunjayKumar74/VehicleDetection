const { getCameraDb, getTheftDb } = require('../connectors/mongo')
const { insurancePool, motPool } = require('../connectors/postgres')
const { getRtoPool } = require('../connectors/mysql')
const { buildVehicleProfile } = require('./globalSchema')
const { checkVehicleConsistency } = require('../services/consistencyChecker')

function normalizePlate(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

async function queryCamera(plate) {
  const db = getCameraDb()
  const normalized = normalizePlate(plate)
  const rows = await db.collection('p3_camera_sightings').aggregate([
    { $lookup: { from: 'p3_observed_vehicles', localField: 'vehicle_id', foreignField: '_id', as: 'vehicle' } },
    { $unwind: '$vehicle' },
    { $match: { 'vehicle.plate_normalized': normalized } },
    { $lookup: { from: 'p3_cameras', localField: 'camera_id', foreignField: '_id', as: 'camera' } },
    { $unwind: { path: '$camera', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'p3_locations', localField: 'camera.location_id', foreignField: '_id', as: 'location' } },
    { $unwind: { path: '$location', preserveNullAndEmptyArrays: true } },
    { $sort: { capture_timestamp: -1 } }, { $limit: 1 },
    { $project: { _id: 0, plate_number: '$vehicle.plate_raw', capture_timestamp: 1, camera_id: '$camera.camera_code', location: '$location.name', vehicle_color: '$vehicle.vehicle_color', vehicle_type: '$vehicle.vehicle_type', source_ids: { sighting: '$_id', camera: '$camera._id', vehicle: '$vehicle._id', location: '$location._id' } } },
  ]).toArray()
  return rows[0] || null
}

async function queryTheft(plate) {
  const db = getTheftDb()
  const normalized = normalizePlate(plate)
  const rows = await db.collection('p3_case_vehicles').aggregate([
    { $lookup: { from: 'p3_reported_vehicles', localField: 'vehicle_id', foreignField: '_id', as: 'vehicle' } },
    { $unwind: '$vehicle' },
    { $match: { 'vehicle.plate_normalized': normalized } },
    { $lookup: { from: 'p3_theft_cases', localField: 'case_id', foreignField: '_id', as: 'case' } },
    { $unwind: '$case' },
    { $lookup: { from: 'p3_police_stations', localField: 'case.station_id', foreignField: '_id', as: 'station' } },
    { $unwind: { path: '$station', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'p3_case_updates', localField: 'case._id', foreignField: 'case_id', as: 'updates' } },
    { $sort: { 'case.reported_at': -1 } }, { $limit: 1 },
    { $project: { _id: 0, number_plate: '$vehicle.plate_raw', status: '$reported_status', reported_date: '$case.reported_at', fir_number: '$case.fir_number', police_station: '$station.name', remarks: { $arrayElemAt: ['$updates.notes', 0] }, source_ids: { case: '$case._id', vehicle: '$vehicle._id', station: '$station._id' } } },
  ]).toArray()
  return rows[0] || null
}

async function federatedLookup(plate) {
  const start = Date.now()
  const [camera, insurance, registration, theft, mot] = await Promise.allSettled([
    (async () => {
      const t = Date.now()
      const data = await queryCamera(plate)
      return { data, latency: Date.now() - t, source: 'DB1_CameraSightings' }
    })(),
    (async () => {
      const t = Date.now()
      const { rows } = await insurancePool.query(`
        SELECT p.reg_no, p.owner_name, i.insurer_name AS insurer_company,
          c.type_name AS policy_type, p.start_date, p.expiry_date, p.is_active, p.premium_amount,
          (SELECT json_agg(json_build_object('renewal_date', r.renewal_date, 'new_expiry', r.new_expiry) ORDER BY r.renewal_date DESC)
             FROM policy_renewals r WHERE r.policy_id = p.policy_id) AS renewals,
          (SELECT json_agg(json_build_object('claim_date', cl.claim_date, 'claim_status', cl.claim_status, 'description', cl.description) ORDER BY cl.claim_date DESC)
             FROM insurance_claims cl WHERE cl.policy_id = p.policy_id) AS claims,
          json_build_object('policy_id', p.policy_id, 'insurer_id', i.insurer_id, 'coverage_type_id', c.coverage_type_id) AS source_ids
        FROM insurance_policies p
        JOIN insurers i ON i.insurer_id = p.insurer_id
        JOIN coverage_types c ON c.coverage_type_id = p.coverage_type_id
        WHERE regexp_replace(upper(p.reg_no), '[^A-Z0-9]', '', 'g') = $1
        ORDER BY p.expiry_date DESC NULLS LAST LIMIT 1`, [normalizePlate(plate)])
      return { data: rows[0] || null, latency: Date.now() - t, source: 'DB2_InsuranceRecords' }
    })(),
    (async () => {
      const t = Date.now()
      const [rows] = await getRtoPool().query(`
        SELECT reg.vehicle_reg_number, owner.owner_name, owner.owner_address, owner.owner_contact,
          model.make AS vehicle_make, model.model_name AS vehicle_model, model.fuel_type,
          veh.year_of_manufacture, veh.engine_number, veh.chassis_number, reg.registration_date,
          JSON_OBJECT('registration_id', reg.registration_id, 'vehicle_id', veh.vehicle_id,
            'owner_id', owner.owner_id, 'model_id', model.model_id) AS source_ids
        FROM rto_registrations reg
        JOIN rto_vehicles veh ON veh.vehicle_id = reg.vehicle_id
        JOIN rto_vehicle_models model ON model.model_id = veh.model_id
        JOIN rto_owners owner ON owner.owner_id = reg.owner_id
        WHERE REGEXP_REPLACE(UPPER(reg.vehicle_reg_number), '[^A-Z0-9]', '') = ?
        ORDER BY reg.registration_date DESC LIMIT 1`, [normalizePlate(plate)])
      return { data: rows[0] || null, latency: Date.now() - t, source: 'DB3_VehicleRegistration' }
    })(),
    (async () => {
      const t = Date.now()
      const data = await queryTheft(plate)
      return { data, latency: Date.now() - t, source: 'DB4_TheftRecords' }
    })(),
    (async () => {
      const t = Date.now()
      const { rows } = await motPool.query(`
        SELECT v.vehicle_number, t.report_date, t.report_type, t.generated_by,
          a.action_taken, COALESCE(a.resolved, FALSE) AS resolved,
          COALESCE((SELECT string_agg(d.description, '; ' ORDER BY d.defect_id)
            FROM mot_defects d WHERE d.test_id = t.test_id), '') AS remarks,
          json_build_object('vehicle_id', v.vehicle_id, 'test_id', t.test_id,
            'centre_id', c.centre_id) AS source_ids
        FROM mot_vehicles v
        JOIN mot_tests t ON t.vehicle_id = v.vehicle_id
        LEFT JOIN inspection_centres c ON c.centre_id = t.centre_id
        LEFT JOIN LATERAL (SELECT action_taken, resolved FROM mot_actions ma
          WHERE ma.test_id = t.test_id ORDER BY ma.action_id DESC LIMIT 1) a ON TRUE
        WHERE regexp_replace(upper(v.vehicle_number), '[^A-Z0-9]', '', 'g') = $1
        ORDER BY t.report_date DESC NULLS LAST LIMIT 1`, [normalizePlate(plate)])
      return { data: rows[0] || null, latency: Date.now() - t, source: 'DB5_MotReports' }
    })(),
  ])

  const extract = settled => settled.status === 'fulfilled'
    ? settled.value
    : { data: null, latency: null, source: null, error: settled.reason?.message }
  const results = [camera, insurance, registration, theft, mot].map(extract)
  const profile = buildVehicleProfile(plate, {
    camera: results[0].data, insurance: results[1].data,
    registration: results[2].data, theft: results[3].data, mot: results[4].data,
  })
  const consistency = checkVehicleConsistency({ registration: results[2].data, insurance: results[1].data })
  const sourceLatencies = results.map(s => ({ source: s.source, latency: s.latency !== null ? `${s.latency}ms` : null, found: s.data !== null, error: s.error || null }))
  return { profile, consistency, meta: { total_latency: `${Date.now() - start}ms`, sources: sourceLatencies } }
}

module.exports = { federatedLookup }
