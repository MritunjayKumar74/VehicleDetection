const express = require('express')
const router = express.Router()
const { SCHEMA_REGISTRY } = require('../mediator/schemaRegistry')

// GET /api/schema/mapping — full registry
router.get('/mapping', (req, res) => {
  res.json(SCHEMA_REGISTRY)
})

// GET /api/schema/mapping/:source — single source
router.get('/mapping/:source', (req, res) => {
  const source = SCHEMA_REGISTRY.sources[req.params.source]
  if (!source) return res.status(404).json({ error: 'Unknown source' })
  res.json({ source: req.params.source, ...source })
})

module.exports = router