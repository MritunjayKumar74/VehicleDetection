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

function alternateCharacter(ch, step = 1) {
  if (/[0-9]/.test(ch)) {
    return String((Number(ch) + step) % 10)
  }

  const code = ch.charCodeAt(0) - 65
  return String.fromCharCode(65 + ((code + step) % 26))
}

function ocrConfusion(ch) {
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

  return map[ch] || alternateCharacter(ch)
}

function replaceAt(text, index, value) {
  if (index < 0 || index >= text.length) return text

  return (
    text.slice(0, index) +
    value +
    text.slice(index + 1)
  )
}

function deleteAt(text, index) {
  return text.slice(0, index) + text.slice(index + 1)
}

function insertAt(text, index, value) {
  return text.slice(0, index) + value + text.slice(index)
}

function swapAt(text, index) {
  if (
    index < 0 ||
    index >= text.length - 1 ||
    text[index] === text[index + 1]
  ) {
    return text
  }

  return (
    text.slice(0, index) +
    text[index + 1] +
    text[index] +
    text.slice(index + 2)
  )
}

function findSwapIndex(plate) {
  for (let i = 5; i < plate.length - 1; i++) {
    if (plate[i] !== plate[i + 1]) return i
  }

  return 4
}

function findConfusableIndices(plate) {
  const chars = new Set([
    '0','O','1','I','2','Z','5','S','8','B'
  ])

  const found = []

  for (let i = 4; i < plate.length; i++) {
    if (chars.has(plate[i])) {
      found.push(i)
    }
  }

  return found
}

function createDecoys(plate) {
  const p = normalizePlate(plate)

  const positions = [
    4,
    5,
    Math.max(6, p.length - 3),
    Math.max(6, p.length - 2),
    p.length - 1
  ]

  const decoys = positions.map(
    (index, i) =>
      replaceAt(
        p,
        index,
        alternateCharacter(p[index], i + 1)
      )
  )

  const swapIndex = findSwapIndex(p)
  decoys.push(swapAt(p, swapIndex))

  return [
    ...new Set(
      decoys.filter(
        value => value && value !== p
      )
    )
  ]
}

function createHardQueries(plate) {
  const p = normalizePlate(plate)

  const i1 = Math.min(6, p.length - 2)
  const i2 = Math.min(8, p.length - 1)

  const confusable = findConfusableIndices(p)

  const c1 =
    confusable.length > 0
      ? confusable[0]
      : i1

  const c2 =
    confusable.length > 1
      ? confusable[1]
      : i2

  let q1 = replaceAt(
    p,
    i1,
    alternateCharacter(p[i1])
  )

  q1 = replaceAt(
    q1,
    i2,
    alternateCharacter(q1[i2], 2)
  )

  let q2 = deleteAt(p, i1)

  const q2Index = Math.min(i2 - 1, q2.length - 1)

  q2 = replaceAt(
    q2,
    q2Index,
    alternateCharacter(q2[q2Index])
  )

  let q3 = insertAt(p, i1, 'A')

  const q3Index = Math.min(i2 + 1, q3.length - 1)

  q3 = replaceAt(
    q3,
    q3Index,
    alternateCharacter(q3[q3Index])
  )

  let q4 = replaceAt(
    p,
    c1,
    ocrConfusion(p[c1])
  )

  q4 = replaceAt(
    q4,
    c2,
    ocrConfusion(q4[c2])
  )

  const swapIndex = findSwapIndex(p)

  return [
    {
      type: 'Two substitutions',
      query: q1
    },
    {
      type: 'Deletion + substitution',
      query: q2
    },
    {
      type: 'Insertion + substitution',
      query: q3
    },
    {
      type: 'Two OCR-style errors',
      query: q4
    },
    {
      type: 'Transposition',
      query: swapAt(p, swapIndex)
    }
  ]
}

function algorithmScore(query, candidate, levWeight) {
  const lev = levenshteinSimilarity(query, candidate)
  const jw = jaroWinkler(query, candidate)

  return (
    levWeight * lev +
    (1 - levWeight) * jw
  )
}

function rank(query, candidates, levWeight) {
  return candidates
    .map(candidate => {
      const distance = plateDistance(query, candidate)

      return {
        plate: candidate,
        distance,
        score: algorithmScore(
          query,
          candidate,
          levWeight
        )
      }
    })
    .filter(
      result =>
        result.distance <= 2 &&
        result.score >= 0.70
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.distance - b.distance ||
        a.plate.localeCompare(b.plate)
    )
}

function evaluate(testCases, realPlates, levWeight) {
  let top1 = 0
  let top3 = 0
  let reciprocalRank = 0

  const byType = {}

  for (const test of testCases) {
    const decoys = createDecoys(test.correct)

    const candidates = [
      ...new Set([
        ...realPlates,
        ...decoys
      ])
    ]

    const ranking = rank(
      test.query,
      candidates,
      levWeight
    )

    const position = ranking.findIndex(
      result =>
        normalizePlate(result.plate) ===
        normalizePlate(test.correct)
    )

    if (position === 0) top1++

    if (position >= 0 && position < 3) {
      top3++
    }

    if (position >= 0) {
      reciprocalRank += 1 / (position + 1)
    }

    if (!byType[test.type]) {
      byType[test.type] = {
        total: 0,
        top1: 0
      }
    }

    byType[test.type].total++

    if (position === 0) {
      byType[test.type].top1++
    }
  }

  return {
    levWeight,
    jwWeight: 1 - levWeight,
    top1,
    top3,
    total: testCases.length,
    mrr: reciprocalRank / testCases.length,
    byType
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

  const testCases = []

  for (const plate of plates) {
    for (const noisy of createHardQueries(plate)) {
      testCases.push({
        correct: plate,
        query: noisy.query,
        type: noisy.type
      })
    }
  }

  console.log('\n==========================================')
  console.log(' HARD PLATE-MATCHING STRESS TEST')
  console.log('==========================================')
  console.log('Real RTO vehicles:', plates.length)
  console.log('Hard noisy queries:', testCases.length)
  console.log(
    'Each test also includes synthetic near-plate competitors.'
  )
  console.log('==========================================\n')

  const weights = []

  for (let i = 0; i <= 10; i++) {
    const levWeight = i / 10

    weights.push(
      evaluate(
        testCases,
        plates,
        levWeight
      )
    )
  }

  console.table(
    weights.map(result => ({
      'Levenshtein Weight':
        (result.levWeight * 100).toFixed(0) + '%',

      'Jaro-Winkler Weight':
        (result.jwWeight * 100).toFixed(0) + '%',

      'Top-1':
        percent(result.top1, result.total),

      'Top-3':
        percent(result.top3, result.total),

      'MRR':
        result.mrr.toFixed(3)
    }))
  )

  const best = [...weights].sort(
    (a, b) =>
      b.top1 - a.top1 ||
      b.mrr - a.mrr
  )[0]

  console.log('\nBEST RESULT')
  console.log(
    'Levenshtein:',
    (best.levWeight * 100).toFixed(0) + '%'
  )

  console.log(
    'Jaro-Winkler:',
    (best.jwWeight * 100).toFixed(0) + '%'
  )

  console.log(
    'Top-1:',
    percent(best.top1, best.total)
  )

  console.log(
    'Top-3:',
    percent(best.top3, best.total)
  )

  console.log(
    'MRR:',
    best.mrr.toFixed(3)
  )

  console.log('\nBEST METHOD BY NOISE TYPE\n')

  console.table(
    Object.entries(best.byType)
      .map(([type, stats]) => ({
        'Noise Type': type,
        Tests: stats.total,
        'Top-1 Correct': stats.top1,
        Accuracy:
          percent(stats.top1, stats.total)
      }))
  )

  await pool.end()
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
