const { getCameraDb, getTheftDb } = require('../connectors/mongo')
const { insurancePool, motPool } = require('../connectors/postgres')
const { getRtoPool } = require('../connectors/mysql')
const { getJoinKey } = require('../mediator/schemaRegistry')
const { markStale } = require('../views/materializedView')
const { SOURCE_NAMES, normalizePlate, findPlateCandidates } = require('./plateMatching')

const CAMERA_SCHEMA = require('../models/CameraSighting').schema
const TheftRecord = require('../models/TheftRecord')

async function reconcileNoisyPlate({ recordedPlate, canonicalPlate, sources }) {
  const oldKey = normalizePlate(recordedPlate)
  const newKey = normalizePlate(canonicalPlate)
  if (oldKey.length < 4 || newKey.length < 4) {
    const error = new Error('Both plate values must contain at least 4 letters or numbers.')
    error.status = 400
    throw error
  }
  if (oldKey === newKey) {
    const error = new Error('The scanned and selected plates are already the same.')
    error.status = 400
    throw error
  }
  if (!Array.isArray(sources) || sources.length === 0 || sources.some(source => !SOURCE_NAMES.includes(source))) {
    const error = new Error('Select at least one valid source database.')
    error.status = 400
    throw error
  }

  const candidates = await findPlateCandidates({ plate: newKey })
  if (!candidates.some(candidate => normalizePlate(candidate.plate) === newKey && candidate.plateDistance === 0)) {
    const error = new Error('The selected target plate was not found in the connected records.')
    error.status = 400
    throw error
  }
  const results = []
  for (const source of [...new Set(sources)]) {
    const plateField = getJoinKey(source)
    let matched = 0
    let updated = 0
    try {
      if (source === 'DB1_CameraSightings' || source === 'DB4_TheftRecords') {
        const connection = source === 'DB1_CameraSightings' ? getCameraDb() : getTheftDb()
        const schema = source === 'DB1_CameraSightings' ? CAMERA_SCHEMA : TheftRecord.schema
        const modelName = source === 'DB1_CameraSightings' ? 'CameraSighting' : 'TheftRecord'
        const Model = connection.models[modelName] || connection.model(modelName, schema)
        const records = await Model.find({}).select(`_id ${plateField}`).lean()
        const ids = records.filter(row => normalizePlate(row[plateField]) === oldKey).map(row => row._id)
        matched = ids.length
        if (matched) {
          const result = await Model.updateMany(
            { _id: { $in: ids } },
            { $set: { [plateField]: newKey } }
          )
          updated = result.modifiedCount ?? result.nModified ?? 0
        }
      } else {
        const isPostgres = source === 'DB2_InsuranceRecords' || source === 'DB5_MotReports'
        const pool = source === 'DB2_InsuranceRecords'
          ? insurancePool
          : source === 'DB5_MotReports'
            ? motPool
            : getRtoPool()
        const table = source === 'DB2_InsuranceRecords'
          ? 'insurance_records'
          : source === 'DB5_MotReports'
            ? 'mot_reports'
            : 'vehicle_registrations'
        const records = isPostgres
          ? (await pool.query(`SELECT id, ${plateField} AS plate FROM ${table}`)).rows
          : (await pool.query(`SELECT id, ${plateField} AS plate FROM ${table}`))[0]
        const matching = records.filter(row => normalizePlate(row.plate) === oldKey)
        matched = matching.length
        for (const row of matching) {
          if (isPostgres) {
            await pool.query(`UPDATE ${table} SET ${plateField} = $1 WHERE id = $2`, [newKey, row.id])
          } else {
            await pool.query(`UPDATE ${table} SET ${plateField} = ? WHERE id = ?`, [newKey, row.id])
          }
          updated += 1
        }
      }
      results.push({ source, matched, updated })
    } catch (error) {
      results.push({ source, matched, updated, error: error.message })
    }
  }

  if (results.some(result => result.updated > 0)) {
    const staleKeys = new Set([
      oldKey,
      newKey,
      String(recordedPlate).trim().toUpperCase(),
      String(canonicalPlate).trim().toUpperCase(),
    ])
    await Promise.allSettled(
      [...staleKeys].map(plate => markStale(plate, 'plate_reconciled'))
    )
  }
  return { recordedPlate, canonicalPlate, updates: results }
}

module.exports = { reconcileNoisyPlate }








