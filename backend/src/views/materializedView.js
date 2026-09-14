const VehicleSnapshot = require('../models/VehicleSnapshot')
const { federatedLookup } = require('../mediator/federatedQuery')

/**
 * Get from materialized view.
 * If stale or missing → refresh from federated query first.
 */
async function getOrRefresh(plate, { forceRefresh = false } = {}) {
  const existing = await VehicleSnapshot.findOne({ plate })

  // HIT — return cached unless stale or forced
  if (existing && !existing.is_stale && !forceRefresh) {
    return {
      profile:      existing.profile,
      meta: {
        served_from:   'materialized_view',
        last_refreshed: existing.last_refreshed,
        refresh_count:  existing.refresh_count,
        is_stale:       false,
        source_latencies: existing.source_latencies,
      }
    }
  }

  // MISS or STALE — run federated query and update view
  const { profile, meta } = await federatedLookup(plate)

  await VehicleSnapshot.findOneAndUpdate(
    { plate },
    {
      plate,
      profile,
      overall_status:   profile.overall_status,
      is_stale:         false,
      stale_reason:     null,
      last_refreshed:   new Date(),
      source_latencies: meta.sources,
      $inc: { refresh_count: existing ? 1 : 0 },
    },
    { upsert: true, new: true }
  )

  return {
    profile,
    meta: {
      served_from:    existing ? 'federated_refresh' : 'federated_new',
      last_refreshed: new Date(),
      refresh_count:  existing ? existing.refresh_count + 1 : 1,
      is_stale:       false,
      total_latency:  meta.total_latency,
      source_latencies: meta.sources,
    }
  }
}

/**
 * Mark a plate's snapshot as stale.
 * Called when any source reports a change for that plate.
 */
async function markStale(plate, reason = 'source_updated') {
  await VehicleSnapshot.findOneAndUpdate(
    { plate },
    { is_stale: true, stale_reason: reason }
  )
  console.log(`[MV] Marked ${plate} as stale — ${reason}`)
}

/**
 * Get all stale snapshots (for a maintenance dashboard).
 */
async function getStaleSnapshots() {
  return VehicleSnapshot.find({ is_stale: true }).select('plate stale_reason last_refreshed')
}

/**
 * Get full view stats — for the GUI dashboard.
 */
async function getViewStats() {
  const total  = await VehicleSnapshot.countDocuments()
  const stale  = await VehicleSnapshot.countDocuments({ is_stale: true })
  const byStatus = await VehicleSnapshot.aggregate([
    { $group: { _id: '$overall_status', count: { $sum: 1 } } }
  ])
  return { total, stale, fresh: total - stale, byStatus }
}

module.exports = { getOrRefresh, markStale, getStaleSnapshots, getViewStats }