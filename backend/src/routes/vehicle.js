const express = require('express')
const router = express.Router()
const { getOrRefresh } = require('../views/materializedView')
const { getSearchHistory, logSearch } = require('../connectors/mysql')

/**
 * GET /api/vehicle/:plate
 * Main lookup endpoint — hits materialized view first,
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