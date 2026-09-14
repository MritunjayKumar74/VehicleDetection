const mongoose = require('mongoose')

/**
 * MATERIALIZED VIEW — VehicleSnapshot
 * Stores the pre-computed VehicleProfile for each plate.
 * Acts as a cache layer over the 5 federated sources.
 */
const VehicleSnapshotSchema = new mongoose.Schema({
  plate:         { type: String, unique: true, index: true },
  profile:       { type: Object },          // full VehicleProfile
  overall_status:{ type: String },          // CLEAR / UNINSURED / STOLEN etc.
  is_stale:      { type: Boolean, default: false },
  stale_reason:  { type: String, default: null },
  last_refreshed:{ type: Date,   default: Date.now },
  refresh_count: { type: Number, default: 1 },
  source_latencies: { type: Object },       // latency breakdown stored too
})

module.exports = mongoose.model('VehicleSnapshot', VehicleSnapshotSchema)