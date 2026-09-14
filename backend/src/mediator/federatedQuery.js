/**
 * FEDERATED QUERY ENGINE
 * Queries all 5 data sources in parallel for a given plate,
 * maps local fields to global schema, and merges results.
 */

const { getCameraDb, getTheftDb } = require('../connectors/mongo')
const { insurancePool, motPool }  = require('../connectors/postgres')
const { getRtoPool }              = require('../connectors/mysql')
const { buildVehicleProfile }     = require('./globalSchema')

const CameraSightingSchema = require('../models/CameraSighting').schema
const TheftRecord          = require('../models/TheftRecord')

async function federatedLookup(plate) {
  const start = Date.now()

  // ── Query all 5 sources in parallel ──────────────────────────
  const [camera, insurance, registration, theft, mot] = await Promise.allSettled([

    // DB1 — Camera (MongoDB cameradb)
    (async () => {
      const t = Date.now()
      const CameraSighting = getCameraDb().model('CameraSighting', CameraSightingSchema)
      const result = await CameraSighting
        .findOne({ plate_number: plate })
        .lean()
      return { data: result, latency: Date.now() - t, source: 'DB1_CameraSightings' }
    })(),

    // DB2 — Insurance (PostgreSQL insurancedb)
    (async () => {
      const t = Date.now()
      const { rows } = await insurancePool.query(
        'SELECT * FROM insurance_records WHERE reg_no = $1 LIMIT 1',
        [plate]
      )
      return { data: rows[0] || null, latency: Date.now() - t, source: 'DB2_InsuranceRecords' }
    })(),

    // DB3 — RTO Registration (MySQL rtodb)
    (async () => {
      const t = Date.now()
      const [rows] = await getRtoPool().query(
        'SELECT * FROM vehicle_registrations WHERE vehicle_reg_number = ? LIMIT 1',
        [plate]
      )
      return { data: rows[0] || null, latency: Date.now() - t, source: 'DB3_VehicleRegistration' }
    })(),

    // DB4 — Theft (MongoDB theftdb)
    (async () => {
      const t = Date.now()
      const TheftModel = getTheftDb().model('TheftRecord', TheftRecord.schema)
      const result = await TheftModel
        .findOne({ number_plate: plate })
        .lean()
      return { data: result, latency: Date.now() - t, source: 'DB4_TheftRecords' }
    })(),

    // DB5 — MOT Reports (PostgreSQL motdb)
    (async () => {
      const t = Date.now()
      const { rows } = await motPool.query(
        'SELECT * FROM mot_reports WHERE vehicle_number = $1 LIMIT 1',
        [plate]
      )
      return { data: rows[0] || null, latency: Date.now() - t, source: 'DB5_MotReports' }
    })(),
  ])

  // ── Extract results + latencies ───────────────────────────────
  const extract = (settled) => settled.status === 'fulfilled'
    ? settled.value
    : { data: null, latency: null, source: null, error: settled.reason?.message }

  const r = [camera, insurance, registration, theft, mot].map(extract)

  // ── Build unified VehicleProfile ──────────────────────────────
  const profile = buildVehicleProfile(plate, {
    camera:       r[0].data,
    insurance:    r[1].data,
    registration: r[2].data,
    theft:        r[3].data,
    mot:          r[4].data,
  })

  // ── Attach source latency breakdown ──────────────────────────
  const sourceLatencies = r.map(s => ({
    source:  s.source,
    latency: s.latency !== null ? `${s.latency}ms` : null,
    found:   s.data !== null,
    error:   s.error || null,
  }))

  return {
    profile,
    meta: {
      total_latency: `${Date.now() - start}ms`,
      sources: sourceLatencies,
    }
  }
}

module.exports = { federatedLookup }