const { getCameraDb, getTheftDb } = require('./connectors/mongo')
const { insurancePool, motPool } = require('./connectors/postgres')
const { getRtoPool } = require('./connectors/mysql')
const schemas = require('./models/phase3MongoSchemas')

function getModel(conn, name, schema) {
  return conn.models[name] || conn.model(name, schema)
}

async function seedPhase3(records) {
  const rto = getRtoPool()
  const cameraDb = getCameraDb()
  const theftDb = getTheftDb()

  // Clear child rows before parent rows (FK-safe). This module owns only p3_* tables.
  await rto.query('DELETE FROM rto_ownership_history')
  await rto.query('DELETE FROM rto_registrations')
  await rto.query('DELETE FROM rto_vehicles')
  await rto.query('DELETE FROM rto_owners')
  await rto.query('DELETE FROM rto_vehicle_models')

  await insurancePool.query('DELETE FROM insurance_claims')
  await insurancePool.query('DELETE FROM policy_renewals')
  await insurancePool.query('DELETE FROM insurance_policies')
  await insurancePool.query('DELETE FROM insurers')
  await insurancePool.query('DELETE FROM coverage_types')

  await motPool.query('DELETE FROM mot_defects')
  await motPool.query('DELETE FROM mot_actions')
  await motPool.query('DELETE FROM mot_tests')
  await motPool.query('DELETE FROM mot_vehicles')
  await motPool.query('DELETE FROM inspection_centres')

  const models = {
    location: getModel(cameraDb, 'P3CameraLocation', schemas.CameraLocationSchema),
    camera: getModel(cameraDb, 'P3CameraDevice', schemas.CameraDeviceSchema),
    observed: getModel(cameraDb, 'P3ObservedVehicle', schemas.ObservedVehicleSchema),
    sighting: getModel(cameraDb, 'P3CameraSighting', schemas.Phase3CameraSightingSchema),
    media: getModel(cameraDb, 'P3SightingMedia', schemas.SightingMediaSchema),
    station: getModel(theftDb, 'P3PoliceStation', schemas.PoliceStationSchema),
    reported: getModel(theftDb, 'P3ReportedVehicle', schemas.ReportedVehicleSchema),
    theftCase: getModel(theftDb, 'P3TheftCase', schemas.TheftCaseSchema),
    caseVehicle: getModel(theftDb, 'P3CaseVehicle', schemas.CaseVehicleSchema),
    update: getModel(theftDb, 'P3CaseUpdate', schemas.CaseUpdateSchema),
  }
  await Promise.all(Object.values(models).map(Model => Model.deleteMany({})))

  const cameraRefs = new Map()
  const stationNames = ['Noida Sec-20 PS', 'Delhi Saket PS', 'Gurugram City PS', 'Jaipur Central PS']
  const insurerNames = ['HDFC Ergo', 'New India Assurance', 'Bajaj Allianz', 'ICICI Lombard', 'Tata AIG']
  const coverNames = ['Comprehensive', 'Third-party']
  const centreNames = ['Central Vehicle Test Centre', 'North Regional Inspection Centre', 'Metro MOT Centre']

  for (const [index, r] of records.entries()) {
    // DB3: owners -> registrations <- vehicles -> vehicle_models; ownership history references both.
    const [ownerResult] = await rto.query(
      'INSERT INTO rto_owners (owner_name, owner_address, owner_contact) VALUES (?, ?, ?)',
      [r.owner, r.address, r.contact]
    )
    const [existingModels] = await rto.query(
      'SELECT model_id FROM rto_vehicle_models WHERE make = ? AND model_name = ? AND fuel_type <=> ? LIMIT 1',
      [r.make, r.model, r.fuel]
    )
    
    let modelId
    if (existingModels.length > 0) {
      modelId = existingModels[0].model_id
    } else {
      const [modelResult] = await rto.query(
        'INSERT INTO rto_vehicle_models (make, model_name, fuel_type, vehicle_type) VALUES (?, ?, ?, ?)',
        [r.make, r.model, r.fuel, r.vehicleType]
      )
      modelId = modelResult.insertId
    }
    
    const [vehicleResult] = await rto.query(
      'INSERT INTO rto_vehicles (model_id, year_of_manufacture, engine_number, chassis_number) VALUES (?, ?, ?, ?)',
      [modelId, r.year, r.engine, r.chassis]
    )
    const [regResult] = await rto.query(
      'INSERT INTO rto_registrations (vehicle_id, owner_id, vehicle_reg_number, registration_date, status) VALUES (?, ?, ?, ?, ?)',
      [vehicleResult.insertId, ownerResult.insertId, r.plate, r.regDate, 'active']
    )
    await rto.query(
      'INSERT INTO rto_ownership_history (registration_id, owner_id, valid_from, valid_to) VALUES (?, ?, ?, NULL)',
      [regResult.insertId, ownerResult.insertId, r.regDate]
    )

    // DB1: locations -> cameras -> sightings <- observed vehicle -> media.
    const cameraCode = r.cameraCode
    let refs = cameraRefs.get(cameraCode)
    if (!refs) {
      const location = await models.location.findOneAndUpdate(
        { name: r.location }, { $setOnInsert: { name: r.location, city: r.location.split(' ')[0], route: r.location } },
        { upsert: true, new: true }
      )
      const camera = await models.camera.findOneAndUpdate(
        { camera_code: cameraCode }, { $setOnInsert: { camera_code: cameraCode, location_id: location._id, status: 'active' } },
        { upsert: true, new: true }
      )
      refs = { camera, location }
      cameraRefs.set(cameraCode, refs)
    }
    const observed = await models.observed.create({
      plate_raw: r.plate, plate_normalized: r.plate.replace(/[^A-Z0-9]/g, '').toUpperCase(),
      vehicle_color: r.color, vehicle_type: r.vehicleType, make: r.make, model: r.model,
    })
    const sighting = await models.sighting.create({
      camera_id: refs.camera._id, vehicle_id: observed._id,
      capture_timestamp: r.captureTime, ocr_confidence: 90 + (index % 10),
    })
    await models.media.create({
      sighting_id: sighting._id, media_uri: `sample://camera/${cameraCode}/${r.plate}`,
      media_type: 'sample-metadata', extracted_text: r.plate,
      metadata: { location: r.location, generated_sample: true },
    })

    // DB2: insurer + coverage type -> policy -> renewal and optional claim.
    if (r.status !== 'uninsured') {
      const insurerName = insurerNames[index % insurerNames.length]
      const coverageName = coverNames[index % coverNames.length]
      const insurer = await insurancePool.query(
        'INSERT INTO insurers (insurer_name) VALUES ($1) ON CONFLICT (insurer_name) DO UPDATE SET insurer_name = EXCLUDED.insurer_name RETURNING insurer_id',
        [insurerName]
      )
      const coverage = await insurancePool.query(
        'INSERT INTO coverage_types (type_name, description) VALUES ($1, $2) ON CONFLICT (type_name) DO UPDATE SET description = EXCLUDED.description RETURNING coverage_type_id',
        [coverageName, `${coverageName} motor policy`]
      )
      const policy = await insurancePool.query(
        `INSERT INTO insurance_policies (reg_no, owner_name, insurer_id, coverage_type_id, start_date, expiry_date, is_active, premium_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING policy_id`,
        [r.plate, r.owner, insurer.rows[0].insurer_id, coverage.rows[0].coverage_type_id,
          r.insStart, r.insExpiry, r.status !== 'uninsured', r.premium]
      )
      await insurancePool.query(
        'INSERT INTO policy_renewals (policy_id, renewal_date, previous_expiry, new_expiry, premium_amount) VALUES ($1,$2,$3,$4,$5)',
        [policy.rows[0].policy_id, r.insStart, r.insStart, r.insExpiry, r.premium]
      )
      if (index % 7 === 0) {
        await insurancePool.query(
          'INSERT INTO insurance_claims (policy_id, claim_date, claim_status, description) VALUES ($1,$2,$3,$4)',
          [policy.rows[0].policy_id, r.insStart, 'closed', 'Synthetic sample claim record']
        )
      }
    }

    // DB5: centre + vehicle -> MOT test -> defect and action.
    if (r.status !== 'clear') {
      const centreName = centreNames[index % centreNames.length]
      const centre = await motPool.query(
        'INSERT INTO inspection_centres (centre_name, location) VALUES ($1,$2) ON CONFLICT (centre_name) DO UPDATE SET location = EXCLUDED.location RETURNING centre_id',
        [centreName, r.location]
      )
      let vehicle = await motPool.query(
        'SELECT vehicle_id FROM mot_vehicles WHERE vehicle_number = $1 ORDER BY vehicle_id LIMIT 1',
        [r.plate]
      )
      if (!vehicle.rows.length) {
        vehicle = await motPool.query(
          'INSERT INTO mot_vehicles (vehicle_number, make, model) VALUES ($1,$2,$3) RETURNING vehicle_id',
          [r.plate, r.make, r.model]
        )
      }
      const test = await motPool.query(
        'INSERT INTO mot_tests (vehicle_id, centre_id, report_date, report_type, generated_by, result) VALUES ($1,$2,$3,$4,$5,$6) RETURNING test_id',
        [vehicle.rows[0].vehicle_id, centre.rows[0].centre_id, r.captureTime,
          r.status === 'expired' ? 'expired_insurance' : r.status === 'stolen' ? 'stolen_sighting' : 'uninsured',
          'AutoSystem', 'attention_required']
      )
      await motPool.query(
        'INSERT INTO mot_defects (test_id, severity, description) VALUES ($1,$2,$3)',
        [test.rows[0].test_id, 'advisory', r.status === 'stolen' ? 'Vehicle reported stolen' : 'Insurance status requires review']
      )
      await motPool.query(
        'INSERT INTO mot_actions (test_id, action_taken, resolved) VALUES ($1,$2,$3)',
        [test.rows[0].test_id, r.action, false]
      )
    }

    // DB4: police station + reported vehicle -> theft case -> link + narrative update.
    if (r.status === 'stolen') {
      const stationName = stationNames[index % stationNames.length]
      const stationCode = `PS-${index % stationNames.length + 1}`
      const station = await models.station.findOneAndUpdate(
        { station_code: stationCode }, { $setOnInsert: { station_code: stationCode, name: stationName, district: stationName.split(' ')[0] } },
        { upsert: true, new: true }
      )
      const reported = await models.reported.create({
        plate_raw: r.plate, plate_normalized: r.plate, make: r.make, model: r.model, color: r.color,
      })
      const fir = `FIR/${new Date().getFullYear()}/${String(index + 1).padStart(5, '0')}`
      const theftCase = await models.theftCase.create({
        fir_number: fir, station_id: station._id, reported_at: r.captureTime, case_status: 'open',
      })
      await models.caseVehicle.create({ case_id: theftCase._id, vehicle_id: reported._id, reported_status: 'stolen' })
      await models.update.create({
        case_id: theftCase._id, updated_at: r.captureTime, status: 'reported',
        notes: `Synthetic incident narrative: vehicle ${r.plate} reported stolen near ${r.location}.`,
      })
    }
  }
  console.log(`[Phase 3] Seeded related records for ${records.length} source vehicles`)
}

module.exports = { seedPhase3 }
