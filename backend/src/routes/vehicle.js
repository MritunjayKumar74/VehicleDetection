const express = require('express')
const router = express.Router()
const { getOrRefresh, getViewStats} = require('../views/materializedView')
const { getSearchHistory, logSearch } = require('../connectors/mysql')
const { findPlateCandidates } = require('../services/plateMatching')
const { reconcileNoisyPlate } = require('../services/plateReconciliation')

/**
 * GET /api/vehicle/:plate
 * Main lookup endpoint â€” hits materialized view first,
 * falls back to federated query on miss/stale.
 */

router.get('/history/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10
    const history = await getSearchHistory(limit)
    res.json({ history })
  } catch (err) {
    console.error('[search history]', err)
    res.status(500).json({ error: 'Failed to fetch history' })
  }
})


router.get('/dashboard/stats', async (req, res) => {
  try {
    const stats = await getViewStats()
    res.json(stats)
  } catch (err) {
    console.error('[dashboard stats]', err)
    res.status(500).json({
      error: 'Failed to fetch dashboard statistics'
    })
  }
})

router.get('/matches', async (req, res) => {
  try {
    const candidates = await findPlateCandidates({
      plate: req.query.plate,
      make: req.query.make,
      model: req.query.model,
      color: req.query.color,
    })
    res.json({
      candidates,
      algorithm: {
        name: 'OCR-aware weighted Damerau-Levenshtein (adjacent transpositions) + contextual ranking',
        plateRules: 'O/0, I/1, B/8, S/5, Z/2 and G/6 substitutions cost 0.25; adjacent transpositions cost 0.65; other edits cost 1.',
        candidateGate: 'At most 2 weighted edits and at least 70% plate similarity.',
        ranking: 'Plate similarity receives 70% when a candidate has usable context; available make, model and color clues split the remaining 30% proportionally. Missing data is ignored. Without usable context, ranking uses plate similarity only.',
      },
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Candidate search failed' })
  }
})

router.post('/reconcile', async (req, res) => {
  try {
    const result = await reconcileNoisyPlate(req.body || {})
    const hasErrors = result.updates.some(update => update.error)
    res.status(hasErrors ? 207 : 200).json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Plate correction failed' })
  }
})
router.get('/:plate', async (req, res) => {
  try {
    const plate = req.params.plate.toUpperCase()
    const forceRefresh = req.query.refresh === 'true'

    const result = await getOrRefresh(plate, { forceRefresh })

    logSearch(plate, result.profile?.overall_status).catch(err =>
      console.error('[search log] failed to record:', err.message)
    )

    res.json(result)
  } catch (err) {
    console.error('[vehicle lookup]', err)
    res.status(500).json({ error: 'Lookup failed', details: err.message })
  }
})

module.exports = router
