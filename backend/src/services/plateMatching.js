const { getCameraDb, getTheftDb } = require('../connectors/mongo')
const { insurancePool, motPool } = require('../connectors/postgres')
const { getRtoPool } = require('../connectors/mysql')
const { getJoinKey } = require('../mediator/schemaRegistry')

const CAMERA_SCHEMA = require('../models/CameraSighting').schema
const TheftRecord = require('../models/TheftRecord')

const SOURCE_NAMES = [
  'DB1_CameraSightings',
  'DB2_InsuranceRecords',
  'DB3_VehicleRegistration',
  'DB4_TheftRecords',
  'DB5_MotReports',
]

function normalizePlate(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function plateDistance(left, right) {
  const a = normalizePlate(left)
  const b = normalizePlate(right)
  const rows = Array.from({ length: a.length + 1 }, () => [])
  for (let i = 0; i <= a.length; i += 1) rows[i][0] = i
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return rows[a.length][b.length]
}

function jaroWinkler(left, right) {
  const a = normalizePlate(left)
  const b = normalizePlate(right)
  if (!a || !b) return 0
  if (a === b) return 1

  const matchDistance = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const aMatches = Array(a.length).fill(false)
  const bMatches = Array(b.length).fill(false)
  let matches = 0

  for (let i = 0; i < a.length; i += 1) {
    const start = Math.max(0, i - matchDistance)
    const end = Math.min(i + matchDistance + 1, b.length)
    for (let j = start; j < end; j += 1) {
      if (bMatches[j] || a[i] !== b[j]) continue
      aMatches[i] = true
      bMatches[j] = true
      matches += 1
      break
    }
  }
  if (!matches) return 0

  const matchedA = a.split('').filter((_, index) => aMatches[index])
  const matchedB = b.split('').filter((_, index) => bMatches[index])
  let transpositions = 0
  for (let i = 0; i < matchedA.length; i += 1) {
    if (matchedA[i] !== matchedB[i]) transpositions += 1
  }
  transpositions /= 2

  const jaro = (
    matches / a.length +
    matches / b.length +
    (matches - transpositions) / matches
  ) / 3
  let prefixLength = 0
  while (prefixLength < Math.min(4, a.length, b.length) && a[prefixLength] === b[prefixLength]) {
    prefixLength += 1
  }
  return jaro + prefixLength * 0.1 * (1 - jaro)
}

function textSimilarity(left, right) {
  const a = String(left || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const b = String(right || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!a || !b) return null
  if (a === b) return 1
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    previous.splice(0, previous.length, ...current)
  }
  return Math.max(0, 1 - previous[b.length] / Math.max(a.length, b.length))
}

async function getSourceRecords() {
  const cameraDb = getCameraDb()
  const theftDb = getTheftDb()
  const Camera = cameraDb.models.CameraSighting || cameraDb.model('CameraSighting', CAMERA_SCHEMA)
  const Theft = theftDb.models.TheftRecord || theftDb.model('TheftRecord', TheftRecord.schema)

  const [camera, insurance, registration, theft, mot] = await Promise.all([
    Camera.find({}, { plate_number: 1, vehicle_color: 1, vehicle_type: 1, location: 1 }).lean(),
    insurancePool.query('SELECT reg_no FROM insurance_records').then(result => result.rows),
    getRtoPool().query('SELECT vehicle_reg_number, vehicle_make, vehicle_model, year_of_manufacture FROM vehicle_registrations').then(([rows]) => rows),
    Theft.find({}, { number_plate: 1 }).lean(),
    motPool.query('SELECT vehicle_number FROM mot_reports').then(result => result.rows),
  ])

  return [
    ...camera.map(record => ({ source: SOURCE_NAMES[0], record })),
    ...insurance.map(record => ({ source: SOURCE_NAMES[1], record })),
    ...registration.map(record => ({ source: SOURCE_NAMES[2], record })),
    ...theft.map(record => ({ source: SOURCE_NAMES[3], record })),
    ...mot.map(record => ({ source: SOURCE_NAMES[4], record })),
  ]
}

function getCandidatePlate(source, record) {
  const field = getJoinKey(source)
  return field ? record[field] : null
}

async function findPlateCandidates({ plate, make, model, color }) {
  const normalizedInput = normalizePlate(plate)
  if (normalizedInput.length < 4) {
    const error = new Error('Enter at least 4 letters or numbers from the plate.')
    error.status = 400
    throw error
  }

  const rows = await getSourceRecords()
  const byPlate = new Map()

  for (const { source, record } of rows) {
    const rawPlate = getCandidatePlate(source, record)
    const key = normalizePlate(rawPlate)
    if (!key) continue
    if (!byPlate.has(key)) {
      byPlate.set(key, {
        plate: String(rawPlate).trim(),
        registration: null,
        insurance: null,
        camera: null,
        theft: null,
        mot: null,
        sources: [],
      })
    }
    const candidate = byPlate.get(key)
    const type = {
      DB1_CameraSightings: 'camera',
      DB2_InsuranceRecords: 'insurance',
      DB3_VehicleRegistration: 'registration',
      DB4_TheftRecords: 'theft',
      DB5_MotReports: 'mot',
    }[source]
    if (!candidate[type]) candidate[type] = record
    if (!candidate.sources.includes(source)) candidate.sources.push(source)
  }

  const context = [
    { name: 'make', value: make, get: c => c.registration?.vehicle_make, weight: 0.12 },
    { name: 'model', value: model, get: c => c.registration?.vehicle_model, weight: 0.12 },
    { name: 'color', value: color, get: c => c.camera?.vehicle_color, weight: 0.06 },
  ].filter(item => String(item.value || '').trim())
  return [...byPlate.values()]
    .map(candidate => {
      const distance = plateDistance(normalizedInput, candidate.plate)
      const levenshteinSimilarity = Math.max(0, 1 - distance / Math.max(normalizedInput.length, normalizePlate(candidate.plate).length))
      const jaroWinklerSimilarity = jaroWinkler(normalizedInput, candidate.plate)
      const plateScore = (levenshteinSimilarity + jaroWinklerSimilarity) / 2
      const contextMatches = context.map(item => {
        const value = item.get(candidate)
        const similarity = textSimilarity(item.value, value)
        return {
          field: item.name,
          scanned: String(item.value).trim(),
          record: value || null,
          similarity,
          matched: similarity !== null && similarity >= 0.75,
        }
      })
      const availableContext = contextMatches
        .map((match, index) => ({ ...match, weight: context[index].weight }))
        .filter(match => match.similarity !== null)
      const availableWeight = availableContext.reduce((sum, match) => sum + match.weight, 0)
      const score = availableWeight
        ? plateScore * 0.70 + availableContext.reduce(
          (sum, match) => sum + match.similarity * (0.30 * match.weight / availableWeight),
          0
        )
        : plateScore
      return {
        plate: candidate.plate,
        score: Math.round(score * 100),
        plateSimilarity: Math.round(plateScore * 100),
        plateDistance: distance,
        levenshteinSimilarity: Math.round(levenshteinSimilarity * 100),
        jaroWinklerSimilarity: Math.round(jaroWinklerSimilarity * 100),
        contextMatches,
        registration: candidate.registration && {
          make: candidate.registration.vehicle_make,
          model: candidate.registration.vehicle_model,
          year: candidate.registration.year_of_manufacture,
        },
        camera: candidate.camera && {
          color: candidate.camera.vehicle_color,
          type: candidate.camera.vehicle_type,
          location: candidate.camera.location,
        },
        sourceRecords: candidate.sources,
      }
    })
    .filter(candidate => candidate.plateDistance <= 2 && candidate.plateSimilarity >= 70)
    .sort((a, b) => b.score - a.score || a.plateDistance - b.plateDistance)
    .slice(0, 10)
}

module.exports = {
  SOURCE_NAMES,
  normalizePlate,
  plateDistance,
  jaroWinkler,
  findPlateCandidates
}


