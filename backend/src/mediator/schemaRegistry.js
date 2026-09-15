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
      'owner', 'owner_address', 'owner_contact',
      'vehicle_make', 'vehicle_model', 'fuel_type',
      'year_of_manufacture', 'engine_number', 'chassis_number',
      'registration_date', 'registered',
      'insurance_status', 'insurer', 'policy_type',
      'insurance_start', 'insurance_expiry', 'premium_amount',
      'stolen', 'theft_status', 'fir_number', 'police_station', 'theft_reported',
      'mot_flagged', 'mot_action', 'mot_resolved', 'mot_report_date',
      'sighted_at', 'sighted_when', 'camera_id', 'vehicle_color', 'vehicle_type',
      'overall_status', 'profile_built_at',
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
        { localField: 'vehicle_color',     globalField: 'vehicle_color', matchType: 'exact'            },
        { localField: 'vehicle_type',      globalField: 'vehicle_type',  matchType: 'exact'            },
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
          { localField: 'reg_no',          globalField: 'plate',            matchType: 'value_based' },
          { localField: 'owner_name',      globalField: 'owner',            matchType: 'semantic'    },
          { localField: 'policy_type',     globalField: 'policy_type',      matchType: 'exact'       },
          { localField: 'start_date',      globalField: 'insurance_start',  matchType: 'semantic'    },
          { localField: 'expiry_date',     globalField: 'insurance_expiry', matchType: 'semantic'    },
          { localField: 'insurer_company', globalField: 'insurer',          matchType: 'semantic'    },
          { localField: 'is_active',       globalField: 'is_active',        matchType: 'exact'       },
          { localField: 'premium_amount',  globalField: 'premium_amount',   matchType: 'exact'       },
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
          { localField: 'vehicle_reg_number',   globalField: 'plate',               matchType: 'name_similarity' },
          { localField: 'owner_name',           globalField: 'owner',               matchType: 'semantic'        },
          { localField: 'owner_address',        globalField: 'owner_address',       matchType: 'exact'           },
          { localField: 'owner_contact',        globalField: 'owner_contact',       matchType: 'exact'           },
          { localField: 'vehicle_make',         globalField: 'vehicle_make',        matchType: 'exact'           },
          { localField: 'vehicle_model',        globalField: 'vehicle_model',       matchType: 'exact'           },
          { localField: 'fuel_type',            globalField: 'fuel_type',           matchType: 'exact'           },
          { localField: 'year_of_manufacture',  globalField: 'year_of_manufacture', matchType: 'exact'           },
          { localField: 'engine_number',        globalField: 'engine_number',       matchType: 'exact'           },
          { localField: 'chassis_number',       globalField: 'chassis_number',      matchType: 'exact'           },
          { localField: 'registration_date',    globalField: 'registration_date',   matchType: 'exact'           },
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
        { localField: 'number_plate',   globalField: 'plate',          matchType: 'name_similarity' },
        { localField: 'status',         globalField: 'theft_status',   matchType: 'semantic'         },
        { localField: 'fir_number',     globalField: 'fir_number',     matchType: 'exact'            },
        { localField: 'police_station', globalField: 'police_station', matchType: 'exact'            },
        { localField: 'reported_date',  globalField: 'theft_reported', matchType: 'semantic'         },
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
        { localField: 'vehicle_number', globalField: 'plate',           matchType: 'name_similarity' },
        { localField: 'report_type',    globalField: 'mot_flagged',     matchType: 'semantic'        },
        { localField: 'action_taken',   globalField: 'mot_action',      matchType: 'semantic'        },
        { localField: 'resolved',       globalField: 'mot_resolved',    matchType: 'exact'           },
        { localField: 'report_date',    globalField: 'mot_report_date', matchType: 'semantic'        },
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