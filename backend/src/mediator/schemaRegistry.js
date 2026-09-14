/**
 * SCHEMA REGISTRY — IIA Schema Matching & Mapping
 *
 * Each data source was designed in isolation with different field names
 * for the same real-world concept (vehicle plate number).
 * This registry explicitly declares:
 *   1. localField  — field name in that source
 *   2. globalField — canonical name in our mediated global schema
 *   3. matchType   — how the match was established
 */

const SCHEMA_REGISTRY = {
  // ── Global mediated schema (GAV) ─────────────────────────────
  globalSchema: {
    name: 'VehicleProfile',
    fields: [
      'plate',
      'owner',
      'vehicle_make',
      'vehicle_model',
      'fuel_type',
      'registration_date',
      'insured',
      'insurance_expiry',
      'insurer',
      'is_active',
      'stolen',
      'fir_number',
      'mot_flagged',
      'mot_action',
      'sighted_at',
      'sighted_when',
      'camera_id',
    ]
  },

  // ── Per-source mappings ───────────────────────────────────────
  sources: {
    DB1_CameraSightings: {
      engine: 'MongoDB',
      database: 'cameradb',
      collection: 'camerasightings',
      joinKey: {
        localField: 'plate_number',
        globalField: 'plate',
        matchType: 'name_similarity',   // "plate_number" ~ "plate"
      },
      fieldMappings: [
        { localField: 'plate_number',       globalField: 'plate',        matchType: 'name_similarity' },
        { localField: 'location',           globalField: 'sighted_at',   matchType: 'semantic'        },
        { localField: 'capture_timestamp',  globalField: 'sighted_when', matchType: 'semantic'        },
        { localField: 'camera_id',          globalField: 'camera_id',    matchType: 'exact'           },
      ]
    },

    DB2_InsuranceRecords: {
      engine: 'PostgreSQL',
      database: 'insurancedb',
      table: 'insurance_records',
      joinKey: {
        localField: 'reg_no',
        globalField: 'plate',
        matchType: 'value_based',       // values match plate_number values
      },
      fieldMappings: [
        { localField: 'reg_no',         globalField: 'plate',            matchType: 'value_based'  },
        { localField: 'owner_name',     globalField: 'owner',            matchType: 'semantic'     },
        { localField: 'expiry_date',    globalField: 'insurance_expiry', matchType: 'semantic'     },
        { localField: 'insurer_company',globalField: 'insurer',          matchType: 'semantic'     },
        { localField: 'is_active',      globalField: 'is_active',        matchType: 'exact'        },
      ]
    },

    DB3_VehicleRegistration: {
      engine: 'MySQL',
      database: 'rtodb',
      table: 'vehicle_registrations',
      joinKey: {
        localField: 'vehicle_reg_number',
        globalField: 'plate',
        matchType: 'name_similarity',   // "vehicle_reg_number" ~ "plate"
      },
      fieldMappings: [
        { localField: 'vehicle_reg_number', globalField: 'plate',             matchType: 'name_similarity' },
        { localField: 'owner_name',         globalField: 'owner',             matchType: 'semantic'        },
        { localField: 'vehicle_make',       globalField: 'vehicle_make',      matchType: 'exact'           },
        { localField: 'vehicle_model',      globalField: 'vehicle_model',     matchType: 'exact'           },
        { localField: 'fuel_type',          globalField: 'fuel_type',         matchType: 'exact'           },
        { localField: 'registration_date',  globalField: 'registration_date', matchType: 'exact'           },
      ]
    },

    DB4_TheftRecords: {
      engine: 'MongoDB',
      database: 'theftdb',
      collection: 'theftrecords',
      joinKey: {
        localField: 'number_plate',
        globalField: 'plate',
        matchType: 'name_similarity',   // "number_plate" ~ "plate"
      },
      fieldMappings: [
        { localField: 'number_plate', globalField: 'plate',      matchType: 'name_similarity' },
        { localField: 'status',       globalField: 'stolen',     matchType: 'semantic'        },
        { localField: 'fir_number',   globalField: 'fir_number', matchType: 'exact'           },
      ]
    },

    DB5_MotReports: {
      engine: 'PostgreSQL',
      database: 'motdb',
      table: 'mot_reports',
      joinKey: {
        localField: 'vehicle_number',
        globalField: 'plate',
        matchType: 'name_similarity',   // "vehicle_number" ~ "plate"
      },
      fieldMappings: [
        { localField: 'vehicle_number', globalField: 'plate',       matchType: 'name_similarity' },
        { localField: 'report_type',    globalField: 'mot_flagged',  matchType: 'semantic'        },
        { localField: 'action_taken',   globalField: 'mot_action',   matchType: 'semantic'        },
      ]
    }
  }
}

/**
 * Given a source name and a local field name,
 * return the global field it maps to.
 */
function resolveGlobalField(sourceName, localField) {
  const source = SCHEMA_REGISTRY.sources[sourceName]
  if (!source) return null
  const mapping = source.fieldMappings.find(m => m.localField === localField)
  return mapping ? mapping.globalField : null
}

/**
 * Given a source name, return the local field name
 * that corresponds to the global join key (plate).
 */
function getJoinKey(sourceName) {
  return SCHEMA_REGISTRY.sources[sourceName]?.joinKey?.localField || null
}

module.exports = { SCHEMA_REGISTRY, resolveGlobalField, getJoinKey }