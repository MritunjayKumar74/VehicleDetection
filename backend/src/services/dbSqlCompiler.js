const crypto = require('crypto')
const { getCameraDb, getTheftDb } = require('../connectors/mongo')
const { insurancePool, motPool } = require('../connectors/postgres')
const { getRtoPool } = require('../connectors/mysql')
const CameraSightingSchema = require('../models/CameraSighting').schema
const TheftRecord = require('../models/TheftRecord')
const { getJoinKey } = require('../mediator/schemaRegistry')
const { markStale } = require('../views/materializedView')
const { findPlateCandidates, normalizePlate } = require('./plateMatching')

const sources = {
  DB1_CameraSightings: {
    aliases: ['DB1_CameraSightings', 'camerasightings', 'CameraSighting'], engine: 'mongo',
    fields: ['plate_number', 'capture_timestamp', 'camera_id', 'location', 'vehicle_color', 'vehicle_type'],
    model: () => { const db = getCameraDb(); return db.models.CameraSighting || db.model('CameraSighting', CameraSightingSchema) },
    idField: '_id',
  },
  DB2_InsuranceRecords: {
    aliases: ['DB2_InsuranceRecords', 'insurance_records'], engine: 'postgres', pool: insurancePool,
    table: 'insurance_records', idField: 'id', fields: ['reg_no', 'owner_name', 'insurer_company', 'policy_type', 'start_date', 'expiry_date', 'is_active', 'premium_amount'],
  },
  DB3_VehicleRegistration: {
    aliases: ['DB3_VehicleRegistration', 'vehicle_registrations'], engine: 'mysql',
    table: 'vehicle_registrations', idField: 'id', fields: ['vehicle_reg_number', 'owner_name', 'owner_address', 'owner_contact', 'registration_date', 'vehicle_make', 'vehicle_model', 'year_of_manufacture', 'engine_number', 'chassis_number', 'fuel_type'],
  },
  DB4_TheftRecords: {
    aliases: ['DB4_TheftRecords', 'theftrecords', 'TheftRecord'], engine: 'mongo',
    fields: ['number_plate', 'status', 'reported_date', 'fir_number', 'police_station', 'shredded_by', 'shredding_date', 'remarks'],
    model: () => { const db = getTheftDb(); return db.models.TheftRecord || db.model('TheftRecord', TheftRecord.schema) },
    idField: '_id',
  },
  DB5_MotReports: {
    aliases: ['DB5_MotReports', 'mot_reports'], engine: 'postgres', pool: motPool,
    table: 'mot_reports', idField: 'id', fields: ['vehicle_number', 'report_date', 'report_type', 'generated_by', 'camera_ref', 'action_taken', 'resolved', 'remarks'],
  },
}

const pendingPlans = new Map()
const PLAN_TTL_MS = 5 * 60 * 1000
const MAX_AFFECTED_ROWS = 100

function fail(message) {
  const error = new Error(message)
  error.status = 400
  throw error
}

function parseValue(raw) {
  const value = raw.trim()
  if (/^NULL$/i.test(value)) return null
  if (/^(TRUE|FALSE)$/i.test(value)) return value.toLowerCase() === 'true'
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value)
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'")
  fail(`Unsupported SQL value: ${value}. Use quoted text, a number, TRUE, FALSE, or NULL.`)
}

function splitComma(text) {
  const pieces = []
  let start = 0
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "'") {
      if (quoted && text[i + 1] === "'") { i += 1; continue }
      quoted = !quoted
    } else if (text[i] === ',' && !quoted) {
      pieces.push(text.slice(start, i).trim())
      start = i + 1
    }
  }
  if (quoted) fail('Unclosed quoted string.')
  pieces.push(text.slice(start).trim())
  return pieces
}

function parsePairs(text, separator) {
  const output = {}
  for (const piece of splitComma(text)) {
    const match = piece.match(separator === '='
      ? /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/s
      : /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/s)
    if (!match) fail(`Could not parse field/value pair: ${piece}`)
    const key = match[1]
    if (Object.prototype.hasOwnProperty.call(output, key)) fail(`Field ${key} is repeated.`)
    output[key] = parseValue(match[2])
  }
  return output
}

function parseSql(sql) {
  if (typeof sql !== 'string' || !sql.trim()) fail('Enter one INSERT, UPDATE, or DELETE statement.')
  const statement = sql.trim().replace(/;\s*$/, '')
  if (statement.includes(';')) fail('Only one SQL statement is allowed at a time.')

  let match = statement.match(/^INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]+)\)\s*VALUES\s*\((.*)\)$/is)
  if (match) {
    const source = resolveSource(match[1])
    const fields = splitComma(match[2])
    const values = splitComma(match[3]).map(parseValue)
    if (fields.length !== values.length) fail('INSERT needs one value for each field.')
    if (new Set(fields).size !== fields.length) fail('INSERT field names must be unique.')
    const data = {}
    fields.forEach((field, index) => { data[field] = values[index] })
    validateFields(source, Object.keys(data))
    return { action: 'INSERT', sourceName: source.name, source, data }
  }

  match = statement.match(/^UPDATE\s+([A-Za-z_][A-Za-z0-9_]*)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/is)
  if (match) {
    const source = resolveSource(match[1])
    const set = parsePairs(match[2], '=')
    const where = parseWhere(match[3])
    validateFields(source, [...Object.keys(set), ...Object.keys(where)])
    if (!Object.keys(set).length) fail('UPDATE needs at least one field in SET.')
    return { action: 'UPDATE', sourceName: source.name, source, set, where }
  }

  match = statement.match(/^DELETE\s+FROM\s+([A-Za-z_][A-Za-z0-9_]*)\s+WHERE\s+(.+)$/is)
  if (match) {
    const source = resolveSource(match[1])
    const where = parseWhere(match[2])
    validateFields(source, Object.keys(where))
    return { action: 'DELETE', sourceName: source.name, source, where }
  }

  fail('Supported commands are INSERT INTO ..., UPDATE ... SET ... WHERE ..., and DELETE FROM ... WHERE ... .')
}

function resolveSource(table) {
  const name = Object.keys(sources).find(key => sources[key].aliases.some(alias => alias.toLowerCase() === table.toLowerCase()))
  if (!name) fail(`Unknown table/source: ${table}. Use one of the five DB source names or its table name.`)
  return { name, ...sources[name] }
}

function parseWhere(text) {
  const parts = []
  let start = 0
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "'") {
      if (quoted && text[i + 1] === "'") { i += 1; continue }
      quoted = !quoted
      continue
    }
    if (!quoted && /^\s+AND\s+/i.test(text.slice(i))) {
      const delimiter = text.slice(i).match(/^\s+AND\s+/i)[0]
      parts.push(text.slice(start, i).trim())
      i += delimiter.length - 1
      start = i + 1
    }
  }
  parts.push(text.slice(start).trim())
  if (quoted) fail('Unclosed quoted string in WHERE clause.')
  if (!parts.length || parts.some(part => !part.trim())) fail('WHERE must contain equality conditions joined with AND.')
  return parsePairs(parts.join(','), '=')
}

function validateFields(source, fields) {
  const unknown = fields.filter(field => !source.fields.includes(field))
  if (unknown.length) fail(`Unknown field(s) for ${source.name}: ${unknown.join(', ')}.`)
}

function getPlateValue(plan) {
  const field = getJoinKey(plan.sourceName)
  if (!field) return null
  if ((plan.action === 'UPDATE' || plan.action === 'DELETE') && plan.where?.[field] != null) {
    return { field, location: 'where', value: String(plan.where[field]) }
  }
  const values = plan.action === 'INSERT' ? plan.data : plan.set
  if (values?.[field] != null) return { field, location: plan.action === 'INSERT' ? 'data' : 'set', value: String(values[field]) }
  return null
}

function setPlateValue(plan, plateInfo, value) {
  if (plateInfo.location === 'where') plan.where[plateInfo.field] = value
  else if (plateInfo.location === 'data') plan.data[plateInfo.field] = value
  else plan.set[plateInfo.field] = value
}

function compileSql(plan) {
  const literal = value => {
    if (value === null) return 'NULL'
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
    if (typeof value === 'number') return String(value)
    return `'${String(value).replace(/'/g, "''")}'`
  }
  const pairs = values => Object.entries(values).map(([field, value]) => `${field} = ${literal(value)}`).join(' AND ')
  if (plan.action === 'INSERT') {
    const fields = Object.keys(plan.data)
    return `INSERT INTO ${plan.sourceName} (${fields.join(', ')}) VALUES (${fields.map(field => literal(plan.data[field])).join(', ')});`
  }
  if (plan.action === 'UPDATE') return `UPDATE ${plan.sourceName} SET ${Object.entries(plan.set).map(([field, value]) => `${field} = ${literal(value)}`).join(', ')} WHERE ${pairs(plan.where)};`
  return `DELETE FROM ${plan.sourceName} WHERE ${pairs(plan.where)};`
}

async function findTypoSuggestions(plan, plateInfo) {
  if (!plateInfo || normalizePlate(plateInfo.value).length < 4) return []
  const context = plan.action === 'INSERT' ? plan.data : { ...(plan.where || {}), ...(plan.set || {}) }
  try {
    const candidates = await findPlateCandidates({
      plate: plateInfo.value,
      make: context.vehicle_make,
      model: context.vehicle_model,
      color: context.vehicle_color,
    })
    if (candidates.some(candidate => normalizePlate(candidate.plate) === normalizePlate(plateInfo.value))) return []
    return candidates
      .filter(candidate => normalizePlate(candidate.plate) !== normalizePlate(plateInfo.value))
      .slice(0, 5)
  } catch (error) {
    if (error.status === 400) return []
    throw error
  }
}

function queryParts(where, engine) {
  const fields = Object.keys(where)
  if (engine === 'mongo') return where
  const clause = fields.map((field, index) => `${field} = ${engine === 'postgres' ? `$${index + 1}` : '?'}`).join(' AND ')
  return { clause, values: fields.map(field => where[field]) }
}

async function selectMatching(plan) {
  const { source, where } = plan
  if (source.engine === 'mongo') return source.model().find(where).limit(MAX_AFFECTED_ROWS + 1).lean()
  const { clause, values } = queryParts(where, source.engine)
  if (source.engine === 'postgres') {
    const { rows } = await source.pool.query(`SELECT * FROM ${source.table} WHERE ${clause} LIMIT ${MAX_AFFECTED_ROWS + 1}`, values)
    return rows
  }
  const [rows] = await getRtoPool().query(`SELECT * FROM ${source.table} WHERE ${clause} LIMIT ${MAX_AFFECTED_ROWS + 1}`, values)
  return rows
}

function stable(value) {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    if (value._bsontype === 'ObjectId') return String(value)
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
  }
  return value
}

async function previewSql(sql, options = {}) {
  const plan = parseSql(sql)
  const plateInfo = getPlateValue(plan)
  if (options.acceptedPlate && plateInfo) setPlateValue(plan, plateInfo, options.acceptedPlate)

  let before = []
  let after = []
  if (plan.action === 'INSERT') {
    if (!options.acceptedPlate && !options.ignoreSuggestions && plateInfo) {
      const exact = await selectMatching({ ...plan, where: { [plateInfo.field]: plateInfo.value } })
      if (!exact.length) {
        const suggestions = await findTypoSuggestions(plan, plateInfo)
        if (suggestions.length) return {
          needsCorrection: true,
          action: plan.action,
          source: plan.sourceName,
          inputPlate: plateInfo.value,
          plateField: plateInfo.field,
          suggestions,
        }
      }
    }
    after = [{ ...plan.data }]
  } else {
    before = await selectMatching(plan)
    if (before.length > MAX_AFFECTED_ROWS) fail(`This command matches more than ${MAX_AFFECTED_ROWS} records. Add WHERE conditions to narrow it.`)
    if (!before.length) {
      const suggestions = !options.acceptedPlate && !options.ignoreSuggestions && plateInfo
        ? await findTypoSuggestions(plan, plateInfo)
        : []
      if (suggestions.length) return {
        needsCorrection: true,
        action: plan.action,
        source: plan.sourceName,
        inputPlate: plateInfo.value,
        plateField: plateInfo.field,
        suggestions,
      }
      fail('No records match the WHERE condition; nothing would change.')
    }
    if (plan.action === 'UPDATE' && plateInfo?.location === 'set' && !options.acceptedPlate && !options.ignoreSuggestions) {
      const suggestions = await findTypoSuggestions(plan, plateInfo)
      if (suggestions.length) return {
        needsCorrection: true,
        action: plan.action,
        source: plan.sourceName,
        inputPlate: plateInfo.value,
        plateField: plateInfo.field,
        suggestions,
      }
    }
    after = plan.action === 'UPDATE'
      ? before.map(record => ({ ...record, ...plan.set }))
      : []
  }
  const previewId = crypto.randomUUID()
  pendingPlans.set(previewId, { ...plan, before: stable(before), expiresAt: Date.now() + PLAN_TTL_MS })
  for (const [key, value] of pendingPlans) if (value.expiresAt < Date.now()) pendingPlans.delete(key)
  return { previewId, action: plan.action, source: plan.sourceName, effectiveSql: compileSql(plan), affectedCount: plan.action === 'INSERT' ? 1 : before.length, before, after }
}

async function executePlan(plan) {
  const { source, action } = plan
  if (action === 'INSERT') {
    if (source.engine === 'mongo') return [await source.model().create(plan.data).then(doc => doc.toObject())]
    const fields = Object.keys(plan.data)
    const values = fields.map(field => plan.data[field])
    if (source.engine === 'postgres') {
      const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ')
      const { rows } = await source.pool.query(`INSERT INTO ${source.table} (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`, values)
      return rows
    }
    const [result] = await getRtoPool().query(`INSERT INTO ${source.table} SET ?`, [plan.data])
    const [rows] = await getRtoPool().query(`SELECT * FROM ${source.table} WHERE id = ?`, [result.insertId])
    return rows
  }

  const ids = plan.before.map(record => record[source.idField])
  if (source.engine === 'mongo') {
    const Model = source.model()
    const results = []
    for (const id of ids) {
      if (action === 'UPDATE') results.push(await Model.findOneAndUpdate({ _id: id, ...plan.where }, { $set: plan.set }, { new: true }).lean())
      else results.push(await Model.findOneAndDelete({ _id: id, ...plan.where }).lean())
    }
    return results.filter(Boolean)
  }

  const updated = []
  for (const id of ids) {
    if (source.engine === 'postgres') {
      const where = { ...plan.where, [source.idField]: id }
      const whereFields = Object.keys(where)
      const whereValues = whereFields.map(field => where[field])
      if (action === 'UPDATE') {
        const setFields = Object.keys(plan.set)
        const setValues = setFields.map(field => plan.set[field])
        const offset = setFields.length
        const whereSql = whereFields.map((field, index) => `${field} = $${offset + index + 1}`).join(' AND ')
        const setSql = setFields.map((field, index) => `${field} = $${index + 1}`).join(', ')
        const { rows } = await source.pool.query(`UPDATE ${source.table} SET ${setSql} WHERE ${whereSql} RETURNING *`, [...setValues, ...whereValues])
        updated.push(...rows)
      } else {
        const whereSql = whereFields.map((field, index) => `${field} = $${index + 1}`).join(' AND ')
        const { rows } = await source.pool.query(`DELETE FROM ${source.table} WHERE ${whereSql} RETURNING *`, whereValues)
        updated.push(...rows)
      }
    } else {
      const where = { ...plan.where, [source.idField]: id }
      if (action === 'UPDATE') {
        await getRtoPool().query(`UPDATE ${source.table} SET ? WHERE ${source.idField} = ? AND ${Object.keys(plan.where).map(field => `${field} = ?`).join(' AND ')}`, [plan.set, id, ...Object.values(plan.where)])
        const [rows] = await getRtoPool().query(`SELECT * FROM ${source.table} WHERE ${source.idField} = ?`, [id])
        updated.push(...rows)
      } else {
        const clauses = Object.keys(where).map(field => `${field} = ?`).join(' AND ')
        const values = Object.keys(where).map(field => where[field])
        const [rows] = await getRtoPool().query(`SELECT * FROM ${source.table} WHERE ${clauses}`, values)
        await getRtoPool().query(`DELETE FROM ${source.table} WHERE ${clauses}`, values)
        updated.push(...rows)
      }
    }
  }
  return updated
}

async function commitSql(previewId) {
  const plan = pendingPlans.get(previewId)
  if (!plan || plan.expiresAt < Date.now()) {
    pendingPlans.delete(previewId)
    fail('This preview expired. Preview the SQL command again before confirming.')
  }
  pendingPlans.delete(previewId)
  if (plan.action !== 'INSERT') {
    const current = await selectMatching(plan)
    if (JSON.stringify(stable(current)) !== JSON.stringify(plan.before)) fail('The matching records changed after preview. Run the preview again and review the new result.')
  }
  const affected = await executePlan(plan)
  const plateField = getJoinKey(plan.sourceName)
  const staleRows = plan.action === 'DELETE' ? plan.before : affected
  for (const record of [...(plan.action === 'UPDATE' ? plan.before : []), ...staleRows]) {
    const plate = record?.[plateField]
    if (plate) markStale(String(plate).toUpperCase(), `sql_${plan.action.toLowerCase()}`).catch(err => console.error('[SQL preview] cache invalidation failed:', err.message))
  }
  return { action: plan.action, source: plan.sourceName, affectedCount: affected.length, records: affected }
}

module.exports = { previewSql, commitSql }
