// routes/dbEditor.js
const express = require('express')
const router  = express.Router()

const { getCameraDb, getTheftDb } = require('../connectors/mongo')
const { insurancePool, motPool }  = require('../connectors/postgres')
const { getRtoPool }              = require('../connectors/mysql')
const { SCHEMA_REGISTRY }         = require('../mediator/schemaRegistry')
const { markStale }               = require('../views/materializedView')

const CameraSightingSchema = require('../models/CameraSighting').schema
const TheftRecord          = require('../models/TheftRecord')

// ── Source config ─────────────────────────────────────────────
function getSourceConfig(source) {
  const configs = {
    DB1_CameraSightings: {
      type: 'mongo',
      getModel: () => {
        const db = getCameraDb()
        return db.models['CameraSighting'] || db.model('CameraSighting', CameraSightingSchema)
      }
    },
    DB2_InsuranceRecords: {
      type: 'postgres',
      pool: insurancePool,
      table: SCHEMA_REGISTRY.sources.DB2_InsuranceRecords.table,
      idField: 'id',
    },
    DB3_VehicleRegistration: {
      type: 'mysql',
      table: SCHEMA_REGISTRY.sources.DB3_VehicleRegistration.table,
      idField: 'id',
    },
    DB4_TheftRecords: {
      type: 'mongo',
      getModel: () => {
        const db = getTheftDb()
        return db.models['TheftRecord'] || db.model('TheftRecord', TheftRecord.schema)
      }
    },
    DB5_MotReports: {
      type: 'postgres',
      pool: motPool,
      table: SCHEMA_REGISTRY.sources.DB5_MotReports.table,
      idField: 'id',
    },
  }
  return configs[source] || null
}

// ── Helper: get the local field name that maps to the global "plate" field ──
function getPlateField(source) {
  return SCHEMA_REGISTRY.sources[source]?.joinKey?.localField
}

// ── Helper: invalidate the materialized view for a given record ─────────────
function invalidatePlate(source, record, reason) {
  if (!record) return
  const plateField = getPlateField(source)
  const plate = plateField ? record[plateField] : null
  if (!plate) return

  markStale(String(plate).toUpperCase(), reason).catch(err =>
    console.error('[markStale] failed:', err.message)
  )
}

// ── GET /api/db/:source — fetch all records ───────────────────
router.get('/:source', async (req, res) => {
  const config = getSourceConfig(req.params.source)
  if (!config) return res.status(404).json({ error: 'Unknown source' })

  try {
    if (config.type === 'mongo') {
      const Model = config.getModel()
      const docs = await Model.find({}).lean()
      return res.json(docs)
    }

    if (config.type === 'postgres') {
      const { rows } = await config.pool.query(`SELECT * FROM ${config.table}`)
      return res.json(rows)
    }

    if (config.type === 'mysql') {
      const [rows] = await getRtoPool().query(`SELECT * FROM ${config.table}`)
      return res.json(rows)
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/db/:source — insert a record ────────────────────
router.post('/:source', async (req, res) => {
  const config = getSourceConfig(req.params.source)
  if (!config) return res.status(404).json({ error: 'Unknown source' })

  try {
    if (config.type === 'mongo') {
      const Model = config.getModel()
      const doc = await Model.create(req.body)
      invalidatePlate(req.params.source, doc.toObject ? doc.toObject() : doc, 'record_inserted')
      return res.status(201).json(doc)
    }

    if (config.type === 'postgres') {
      const fields = Object.keys(req.body)
      const values = Object.values(req.body)
      const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ')
      const { rows } = await config.pool.query(
        `INSERT INTO ${config.table} (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        values
      )
      invalidatePlate(req.params.source, rows[0], 'record_inserted')
      return res.status(201).json(rows[0])
    }

    if (config.type === 'mysql') {
      const [result] = await getRtoPool().query(
        `INSERT INTO ${config.table} SET ?`,
        [req.body]
      )
      const [rows] = await getRtoPool().query(
        `SELECT * FROM ${config.table} WHERE id = ?`,
        [result.insertId]
      )
      invalidatePlate(req.params.source, rows[0], 'record_inserted')
      return res.status(201).json(rows[0])
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── PUT /api/db/:source/:id — edit a record ───────────────────
router.put('/:source/:id', async (req, res) => {
  const config = getSourceConfig(req.params.source)
  if (!config) return res.status(404).json({ error: 'Unknown source' })

  try {
    if (config.type === 'mongo') {
      const Model = config.getModel()
      const doc = await Model.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true }
      ).lean()
      if (!doc) return res.status(404).json({ error: 'Record not found' })
      invalidatePlate(req.params.source, doc, 'record_updated')
      return res.json(doc)
    }

    if (config.type === 'postgres') {
      const fields = Object.keys(req.body)
      const values = Object.values(req.body)
      const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ')
      const { rows } = await config.pool.query(
        `UPDATE ${config.table} SET ${setClause} WHERE ${config.idField} = $${fields.length + 1} RETURNING *`,
        [...values, req.params.id]
      )
      if (!rows.length) return res.status(404).json({ error: 'Record not found' })
      invalidatePlate(req.params.source, rows[0], 'record_updated')
      return res.json(rows[0])
    }

    if (config.type === 'mysql') {
      await getRtoPool().query(
        `UPDATE ${config.table} SET ? WHERE ${config.idField} = ?`,
        [req.body, req.params.id]
      )
      const [rows] = await getRtoPool().query(
        `SELECT * FROM ${config.table} WHERE ${config.idField} = ?`,
        [req.params.id]
      )
      if (!rows.length) return res.status(404).json({ error: 'Record not found' })
      invalidatePlate(req.params.source, rows[0], 'record_updated')
      return res.json(rows[0])
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/db/:source/:id — delete a record ─────────────
router.delete('/:source/:id', async (req, res) => {
  const config = getSourceConfig(req.params.source)
  if (!config) return res.status(404).json({ error: 'Unknown source' })

  try {
    if (config.type === 'mongo') {
      const Model = config.getModel()
      const doc = await Model.findByIdAndDelete(req.params.id).lean()
      if (!doc) return res.status(404).json({ error: 'Record not found' })
      invalidatePlate(req.params.source, doc, 'record_deleted')
      return res.json({ deleted: true })
    }

    if (config.type === 'postgres') {
      const { rows } = await config.pool.query(
        `DELETE FROM ${config.table} WHERE ${config.idField} = $1 RETURNING *`,
        [req.params.id]
      )
      if (!rows.length) return res.status(404).json({ error: 'Record not found' })
      invalidatePlate(req.params.source, rows[0], 'record_deleted')
      return res.json({ deleted: true })
    }

    if (config.type === 'mysql') {
      const [existingRows] = await getRtoPool().query(
        `SELECT * FROM ${config.table} WHERE ${config.idField} = ?`,
        [req.params.id]
      )
      const [result] = await getRtoPool().query(
        `DELETE FROM ${config.table} WHERE ${config.idField} = ?`,
        [req.params.id]
      )
      if (!result.affectedRows) return res.status(404).json({ error: 'Record not found' })
      invalidatePlate(req.params.source, existingRows[0], 'record_deleted')
      return res.json({ deleted: true })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router