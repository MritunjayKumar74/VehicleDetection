const { connectMySQL, getRtoPool } = require('./connectors/mysql')
const {
  normalizePlate,
  plateDistance,
  jaroWinkler
} = require('./services/plateMatching')

function levenshteinSimilarity(a, b) {
  const left = normalizePlate(a)
  const right = normalizePlate(b)
  const distance = plateDistance(left, right)

  return Math.max(
    0,
    1 - distance / Math.max(left.length, right.length)
  )
}

function combinedSimilarity(a, b) {
  return (
    levenshteinSimilarity(a, b) +
    jaroWinkler(a, b)
  ) / 2
}

function replaceAt(text, index, replacement) {
  return (
    text.substring(0, index) +
    replacement +
    text.substring(index + 1)
  )
}

function confusedCharacter(ch) {
  const map = {
    '0': 'O',
    'O': '0',
    '1': 'I',
    'I': '1',
    '2': 'Z',
    'Z': '2',
    '5': 'S',
    'S': '5',
    '8': 'B',
    'B': '8'
  }

  if (map[ch]) return map[ch]

  if (/[0-9]/.test(ch)) {
    return String((Number(ch) + 1) % 10)
  }

  return ch === 'A' ? 'B' : 'A'
}

function findUsefulIndex(plate) {
  const confusable = ['0','O','1','I','2','Z','5','S','8','B']

  for (let i = 4; i < plate.length; i++) {
    if (confusable.includes(plate[i])) {
      return i
    }
  }

  return Math.min(6, plate.length - 1)
}

function findSwapIndex(plate) {
  for (let i = 4; i < plate.length - 1; i++) {
    if (plate[i] !== plate[i + 1]) {
      return i
    }
  }

  return 4
}

function createNoise(plate) {
  const p = normalizePlate(plate)

  const editIndex = Math.min(6, p.length - 1)
  const confusionIndex = findUsefulIndex(p)
  const swapIndex = findSwapIndex(p)

  const swapped =
    p.slice(0, swapIndex) +
    p[swapIndex + 1] +
    p[swapIndex] +
    p.slice(swapIndex + 2)

  return [
    {
      type: 'Formatting',
      query:
        p.slice(0, 2) + '-' +
        p.slice(2, 4) + '-' +
        p.slice(4, 6) + '-' +
        p.slice(6)
    },

    {
      type: 'Deletion',
      query:
        p.slice(0, editIndex) +
        p.slice(editIndex + 1)
    },

    {
      type: 'Insertion',
      query:
        p.slice(0, editIndex) +
        'A' +
        p.slice(editIndex)
    },

    {
      type: 'Substitution',
      query: replaceAt(
        p,
        editIndex,
        confusedCharacter(p[editIndex])
      )
    },

    {
      type: 'OCR confusion',
      query: replaceAt(
        p,
        confusionIndex,
        confusedCharacter(p[confusionIndex])
      )
    },

    {
      type: 'Transposition',
      query: swapped
    }
  ]
}

function score(query, candidate, algorithm) {
  if (algorithm === 'Exact') {
    return normalizePlate(query) === normalizePlate(candidate)
      ? 1
      : 0
  }

  if (algorithm === 'Levenshtein') {
    return levenshteinSimilarity(query, candidate)
  }

  if (algorithm === 'Jaro-Winkler') {
    return jaroWinkler(query, candidate)
  }

  return combinedSimilarity(query, candidate)
}

function rank(query, plates, algorithm) {
  return plates
    .map(plate => ({
      plate,
      score: score(query, plate, algorithm),
      distance: plateDistance(query, plate)
    }))
    .filter(result => {
      if (algorithm === 'Exact') {
        return result.score === 1
      }

      return (
        result.distance <= 2 &&
        result.score >= 0.70
      )
    })
    .sort((a, b) =>
      b.score - a.score ||
      a.distance - b.distance
    )
}

function evaluate(testCases, plates, algorithm) {
  let top1 = 0
  let top3 = 0

  const byNoise = {}

  for (const test of testCases) {
    const results = rank(
      test.query,
      plates,
      algorithm
    )

    const first = results[0]

    const correctTop1 =
      first &&
      normalizePlate(first.plate) ===
      normalizePlate(test.correct)

    const correctTop3 =
      results
        .slice(0, 3)
        .some(
          result =>
            normalizePlate(result.plate) ===
            normalizePlate(test.correct)
        )

    if (correctTop1) top1++
    if (correctTop3) top3++

    if (!byNoise[test.type]) {
      byNoise[test.type] = {
        total: 0,
        correct: 0
      }
    }

    byNoise[test.type].total++

    if (correctTop1) {
      byNoise[test.type].correct++
    }
  }

  return {
    algorithm,
    top1,
    top3,
    total: testCases.length,
    byNoise
  }
}

function percent(value, total) {
  return ((value / total) * 100).toFixed(2) + '%'
}

async function main() {
  await connectMySQL()

  const pool = getRtoPool()

  const [rows] = await pool.query(
    'SELECT vehicle_reg_number FROM vehicle_registrations'
  )

  const plates = [
    ...new Set(
      rows
        .map(row =>
          normalizePlate(row.vehicle_reg_number)
        )
        .filter(Boolean)
    )
  ]

  if (plates.length < 2) {
    throw new Error(
      'Not enough RTO records. Need at least 2 vehicles.'
    )
  }

  const testCases = []

  for (const plate of plates) {
    for (const noisy of createNoise(plate)) {
      testCases.push({
        correct: plate,
        query: noisy.query,
        type: noisy.type
      })
    }
  }

  console.log('\n==========================================')
  console.log(' VEHICLE PLATE MATCHING BENCHMARK')
  console.log('==========================================')
  console.log('Vehicles tested:', plates.length)
  console.log('Noisy queries:', testCases.length)
  console.log('==========================================\n')

  const algorithms = [
    'Exact',
    'Levenshtein',
    'Jaro-Winkler',
    'Combined'
  ]

  const results = algorithms.map(
    algorithm =>
      evaluate(
        testCases,
        plates,
        algorithm
      )
  )

  console.table(
    results.map(result => ({
      Algorithm:
        result.algorithm === 'Combined'
          ? 'Levenshtein + Jaro-Winkler'
          : result.algorithm,

      'Top-1 Accuracy':
        percent(result.top1, result.total),

      'Top-3 Accuracy':
        percent(result.top3, result.total),

      'Correct / Total':
        result.top1 + ' / ' + result.total
    }))
  )

  const combined = results.find(
    result => result.algorithm === 'Combined'
  )

  console.log('\nCOMBINED METHOD BY NOISE TYPE\n')

  console.table(
    Object.entries(combined.byNoise)
      .map(([type, data]) => ({
        'Noise Type': type,
        Tests: data.total,
        Correct: data.correct,
        Accuracy: percent(
          data.correct,
          data.total
        )
      }))
  )

  console.log('\nExample noisy queries:\n')

  console.table(
    testCases.slice(0, 12).map(test => ({
      Correct: test.correct,
      Noisy: test.query,
      Type: test.type
    }))
  )

  await pool.end()
}

main().catch(error => {
  console.error('\nBENCHMARK ERROR:')
  console.error(error)
  process.exit(1)
})
