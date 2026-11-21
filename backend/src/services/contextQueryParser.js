const COLORS = ['silver', 'white', 'black', 'red', 'blue', 'grey', 'gray', 'brown', 'green', 'yellow']
const MAKES = ['Maruti Suzuki', 'Hyundai', 'Mahindra', 'Volkswagen', 'Mercedes-Benz', 'Honda', 'Toyota', 'Tata', 'Kia', 'Renault', 'Skoda', 'BMW', 'Audi', 'Ford', 'Nissan', 'Suzuki']
const MODELS = [
  'Baleno', 'Brezza', 'Swift', 'Alto', 'Creta', 'i20', 'Verna', 'Venue',
  'Nexon', 'Harrier', 'Punch', 'Altroz', 'City', 'Amaze', 'WRV',
  'Seltos', 'Sonet', 'Carens',
]
const VEHICLE_TYPES = ['hatchback', 'motorcycle', 'crossover', 'sedan', 'suv', 'truck', 'van', 'bus', 'bike', 'coupe']
const STOP_WORDS = /\b(?:whose|with|and|having|that|which|make|model|colour|color|type|vehicle|vehicles|car|cars|near|at|around|in)\b/i

function findKnownValue(sentence, values) {
  const sorted = [...values].sort((a, b) => b.length - a.length)
  for (const value of sorted) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = sentence.match(new RegExp(`\\b${escaped}(?:s|es)?\\b`, 'i'))
    if (match) return value
  }
  return null
}

function explicitValue(sentence, fieldNames, maxWords = 3) {
  const field = fieldNames.join('|')
  const word = '[A-Za-z0-9][A-Za-z0-9-]*'
  const match = sentence.match(new RegExp(`\\b(?:${field})\\s*(?:is|equals|of|=|:)?\\s+(${word}(?:\\s+${word}){0,${maxWords - 1}})`, 'i'))
  if (!match) return null
  const value = match[1].split(STOP_WORDS)[0].trim().replace(/[.,!?;:]+$/, '')
  return value || null
}

function extractLocation(sentence) {
  const match = sentence.match(/\b(?:location\s*(?:is|equals|=|:)?\s+|near\s+|at\s+|around\s+|in\s+)([A-Za-z0-9][A-Za-z0-9\s-]{1,70})/i)
  if (!match) return null
  const value = match[1].split(STOP_WORDS)[0].trim().replace(/[.,!?;:]+$/, '')
  return value.length >= 2 ? value : null
}


function findUnsupportedClues(sentence, filters) {
  let remaining = sentence.toLowerCase()

  for (const value of Object.values(filters)) {
    if (!value) continue

    const escaped = String(value)
      .toLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    remaining = remaining.replace(
      new RegExp(`\\b${escaped}(?:s|es)?\\b`, 'gi'),
      ' '
    )
  }

  const fillerWords = [
    'show', 'find', 'list', 'display', 'return', 'give',
    'me', 'please', 'all', 'only',
    'vehicle', 'vehicles', 'car', 'cars',
    'whose', 'which', 'that', 'with', 'having', 'where',
    'and', 'or', 'the', 'a', 'an',
    'is', 'are', 'was', 'were',
    'equals', 'equal', 'to', 'of',
    'colour', 'color', 'make', 'manufacturer',
    'model', 'type',
    'near', 'at', 'around', 'in',
    'seen', 'sighted', 'detected',
    'made', 'by', 'for'
  ]

  for (const word of fillerWords) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    remaining = remaining.replace(
      new RegExp(`\\b${escaped}\\b`, 'gi'),
      ' '
    )
  }

  remaining = remaining
    .replace(/[.,!?;:=()[\]{}"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return remaining ? [remaining] : []
}

function parseContextSentence(input) {
  const sentence = String(input || '').trim().replace(/\s+/g, ' ')
  if (sentence.length < 3 || sentence.length > 300) {
    const error = new Error('Enter a search sentence between 3 and 300 characters.')
    error.status = 400
    throw error
  }

  const filters = {}
  const explicitColor = explicitValue(sentence, ['colou?r'], 1)
  const color = explicitColor || findKnownValue(sentence, COLORS)
  if (color) filters.color = color.toLowerCase()

  const explicitMake = explicitValue(sentence, ['make', 'manufacturer'], 3)
  const make = findKnownValue(sentence, MAKES) || explicitMake
  if (make) filters.make = make

  const explicitModel = explicitValue(sentence, ['model'], 2)
  const model = findKnownValue(sentence, MODELS) || explicitModel
  if (model) filters.model = model

  const explicitType = explicitValue(sentence, ['vehicle\\s+type', 'type'], 1)
  const type = explicitType || findKnownValue(sentence, VEHICLE_TYPES)
  if (type) {
    const normalizedType = type.toLowerCase()
    filters.vehicleType = VEHICLE_TYPES.find(value => value === normalizedType || `${value}s` === normalizedType || `${value}es` === normalizedType) || normalizedType
  }

  const location = extractLocation(sentence)
  if (location) filters.location = location

  if (!Object.keys(filters).length) {
    const error = new Error('I could not identify a supported vehicle clue. Try a colour, make, model, vehicle type, or location—for example, “List all vehicles whose colour is red.”')
    error.status = 400
    throw error
  }

  const annotations = Object.entries(filters).map(([field, value]) => ({
    field,
    value,
  }))

  const unsupportedClues = findUnsupportedClues(sentence, filters)

  return {
    sentence,
    filters,
    annotations,
    unsupportedClues,
  }
}

module.exports = { parseContextSentence }
