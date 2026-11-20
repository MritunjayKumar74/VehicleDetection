const SCHEMA_REGISTRY = {
  globalSchema: {
    name: 'VehicleProfile',
    fields: [
      'plate', 'owner', 'owner_address', 'owner_contact', 'vehicle_make', 'vehicle_model',
      'fuel_type', 'year_of_manufacture', 'engine_number', 'chassis_number', 'registration_date',
      'registered', 'insurance_status', 'insurer', 'policy_type', 'insurance_start', 'insurance_expiry',
      'premium_amount', 'stolen', 'theft_status', 'fir_number', 'police_station', 'theft_reported',
      'mot_flagged', 'mot_action', 'mot_resolved', 'mot_report_date', 'sighted_at', 'sighted_when',
      'camera_id', 'vehicle_color', 'vehicle_type', 'overall_status', 'profile_built_at',
    ],
  },
  sources: {
    DB1_CameraSightings: {
      engine: 'MongoDB', database: 'cameradb', collection: 'p3_camera_sightings',
      entities: ['p3_locations', 'p3_cameras', 'p3_observed_vehicles', 'p3_camera_sightings', 'p3_sighting_media'],
      relationships: [
        'p3_cameras.location_id -> p3_locations._id',
        'p3_camera_sightings.camera_id -> p3_cameras._id',
        'p3_camera_sightings.vehicle_id -> p3_observed_vehicles._id',
        'p3_sighting_media.sighting_id -> p3_camera_sightings._id',
      ],
      joinKey: { localField: 'plate_number', globalField: 'plate', matchType: 'normalized_value' },
      fieldMappings: [
        { localField: 'plate_number', globalField: 'plate', matchType: 'normalized_value' },
        { localField: 'location', globalField: 'sighted_at', matchType: 'relationship_lookup' },
        { localField: 'capture_timestamp', globalField: 'sighted_when', matchType: 'exact' },
        { localField: 'camera_id', globalField: 'camera_id', matchType: 'relationship_lookup' },
        { localField: 'vehicle_color', globalField: 'vehicle_color', matchType: 'exact' },
        { localField: 'vehicle_type', globalField: 'vehicle_type', matchType: 'exact' },
      ],
    },
    DB2_InsuranceRecords: {
      engine: 'PostgreSQL', database: 'insurancedb', table: 'insurance_policies',
      entities: ['insurers', 'coverage_types', 'insurance_policies', 'policy_renewals', 'insurance_claims'],
      relationships: [
        'insurance_policies.insurer_id -> insurers.insurer_id',
        'insurance_policies.coverage_type_id -> coverage_types.coverage_type_id',
        'policy_renewals.policy_id -> insurance_policies.policy_id',
        'insurance_claims.policy_id -> insurance_policies.policy_id',
      ],
      joinKey: { localField: 'reg_no', globalField: 'plate', matchType: 'normalized_value' },
      fieldMappings: [
        { localField: 'reg_no', globalField: 'plate', matchType: 'normalized_value' },
        { localField: 'owner_name', globalField: 'owner', matchType: 'exact' },
        { localField: 'policy_type', globalField: 'policy_type', matchType: 'relationship_lookup' },
        { localField: 'start_date', globalField: 'insurance_start', matchType: 'exact' },
        { localField: 'expiry_date', globalField: 'insurance_expiry', matchType: 'exact' },
        { localField: 'insurer_company', globalField: 'insurer', matchType: 'relationship_lookup' },
        { localField: 'is_active', globalField: 'is_active', matchType: 'exact' },
        { localField: 'premium_amount', globalField: 'premium_amount', matchType: 'exact' },
      ],
    },
    DB3_VehicleRegistration: {
      engine: 'MySQL', database: 'rtodb', table: 'rto_registrations',
      entities: ['rto_owners', 'rto_vehicle_models', 'rto_vehicles', 'rto_registrations', 'rto_ownership_history'],
      relationships: [
        'rto_vehicles.model_id -> rto_vehicle_models.model_id',
        'rto_registrations.vehicle_id -> rto_vehicles.vehicle_id',
        'rto_registrations.owner_id -> rto_owners.owner_id',
        'rto_ownership_history.registration_id -> rto_registrations.registration_id',
        'rto_ownership_history.owner_id -> rto_owners.owner_id',
      ],
      joinKey: { localField: 'vehicle_reg_number', globalField: 'plate', matchType: 'normalized_value' },
      fieldMappings: [
        { localField: 'vehicle_reg_number', globalField: 'plate', matchType: 'normalized_value' },
        { localField: 'owner_name', globalField: 'owner', matchType: 'relationship_lookup' },
        { localField: 'owner_address', globalField: 'owner_address', matchType: 'relationship_lookup' },
        { localField: 'owner_contact', globalField: 'owner_contact', matchType: 'relationship_lookup' },
        { localField: 'vehicle_make', globalField: 'vehicle_make', matchType: 'relationship_lookup' },
        { localField: 'vehicle_model', globalField: 'vehicle_model', matchType: 'relationship_lookup' },
        { localField: 'fuel_type', globalField: 'fuel_type', matchType: 'relationship_lookup' },
        { localField: 'year_of_manufacture', globalField: 'year_of_manufacture', matchType: 'exact' },
        { localField: 'engine_number', globalField: 'engine_number', matchType: 'exact' },
        { localField: 'chassis_number', globalField: 'chassis_number', matchType: 'exact' },
        { localField: 'registration_date', globalField: 'registration_date', matchType: 'exact' },
      ],
    },
    DB4_TheftRecords: {
      engine: 'MongoDB', database: 'theftdb', collection: 'p3_case_vehicles',
      entities: ['p3_police_stations', 'p3_reported_vehicles', 'p3_theft_cases', 'p3_case_vehicles', 'p3_case_updates'],
      relationships: [
        'p3_theft_cases.station_id -> p3_police_stations._id',
        'p3_case_vehicles.case_id -> p3_theft_cases._id',
        'p3_case_vehicles.vehicle_id -> p3_reported_vehicles._id',
        'p3_case_updates.case_id -> p3_theft_cases._id',
      ],
      joinKey: { localField: 'number_plate', globalField: 'plate', matchType: 'normalized_value' },
      fieldMappings: [
        { localField: 'number_plate', globalField: 'plate', matchType: 'normalized_value' },
        { localField: 'status', globalField: 'theft_status', matchType: 'relationship_lookup' },
        { localField: 'fir_number', globalField: 'fir_number', matchType: 'relationship_lookup' },
        { localField: 'police_station', globalField: 'police_station', matchType: 'relationship_lookup' },
        { localField: 'reported_date', globalField: 'theft_reported', matchType: 'relationship_lookup' },
      ],
    },
    DB5_MotReports: {
      engine: 'PostgreSQL', database: 'motdb', table: 'mot_vehicles',
      entities: ['inspection_centres', 'mot_vehicles', 'mot_tests', 'mot_defects', 'mot_actions'],
      relationships: [
        'mot_tests.vehicle_id -> mot_vehicles.vehicle_id',
        'mot_tests.centre_id -> inspection_centres.centre_id',
        'mot_defects.test_id -> mot_tests.test_id',
        'mot_actions.test_id -> mot_tests.test_id',
      ],
      joinKey: { localField: 'vehicle_number', globalField: 'plate', matchType: 'normalized_value' },
      fieldMappings: [
        { localField: 'vehicle_number', globalField: 'plate', matchType: 'normalized_value' },
        { localField: 'report_type', globalField: 'mot_flagged', matchType: 'exact' },
        { localField: 'action_taken', globalField: 'mot_action', matchType: 'relationship_lookup' },
        { localField: 'resolved', globalField: 'mot_resolved', matchType: 'relationship_lookup' },
        { localField: 'report_date', globalField: 'mot_report_date', matchType: 'exact' },
      ],
    },
  },
}

function resolveGlobalField(sourceName, localField) {
  const source = SCHEMA_REGISTRY.sources[sourceName]
  if (!source) return null
  const mapping = source.fieldMappings.find(item => item.localField === localField)
  return mapping ? mapping.globalField : null
}
function getJoinKey(sourceName) {
  return SCHEMA_REGISTRY.sources[sourceName]?.joinKey?.localField || null
}
module.exports = { SCHEMA_REGISTRY, resolveGlobalField, getJoinKey }
