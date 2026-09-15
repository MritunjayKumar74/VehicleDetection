/**
 * GLOBAL SCHEMA BUILDER — GAV Mediated Schema
 * Uses schemaRegistry field mappings to generically merge
 * results from all 5 sources into a canonical VehicleProfile.
 */

const { SCHEMA_REGISTRY } = require('./schemaRegistry')

function mapSourceToGlobal(sourceName, rawData) {
  if (!rawData) return {}
  const mappings = SCHEMA_REGISTRY.sources[sourceName].fieldMappings
  const result = {}
  for (const { localField, globalField } of mappings) {
    result[globalField] = rawData[localField] ?? null
  }
  return result
}

function buildVehicleProfile(plate, { camera, insurance, registration, theft, mot }) {
  const now = new Date()

  const registrationFields = mapSourceToGlobal('DB3_VehicleRegistration', registration)
  const insuranceFields    = mapSourceToGlobal('DB2_InsuranceRecords', insurance)
  const theftFields        = mapSourceToGlobal('DB4_TheftRecords', theft)
  const motFields          = mapSourceToGlobal('DB5_MotReports', mot)
  const cameraFields       = mapSourceToGlobal('DB1_CameraSightings', camera)

  // ── Derive insurance status (business logic, not a 1:1 mapping) ─
  let insuranceStatus = 'uninsured'
  if (insurance) {
    const expiry = new Date(insurance.expiry_date)
    if (!insurance.is_active)  insuranceStatus = 'cancelled'
    else if (expiry < now)     insuranceStatus = 'expired'
    else                       insuranceStatus = 'active'
  }

  const stolenStatus = theft ? theft.status : null

  return {
    plate,
    ...registrationFields,
    registered: !!registration,

    ...insuranceFields,
    insurance_status: insuranceStatus,   // overrides raw is_active passthrough with derived status

    ...theftFields,
    stolen: stolenStatus === 'stolen',

    ...motFields,
    mot_resolved: mot?.resolved || false,

    ...cameraFields,

    overall_status: deriveOverallStatus(insuranceStatus, stolenStatus, !!registration),
    profile_built_at: now.toISOString(),
  }
}

function deriveOverallStatus(insuranceStatus, stolenStatus, registered) {
  if (stolenStatus === 'stolen')       return 'STOLEN'
  if (!registered)                     return 'UNREGISTERED'
  if (insuranceStatus === 'uninsured') return 'UNINSURED'
  if (insuranceStatus === 'expired')   return 'INSURANCE_EXPIRED'
  if (insuranceStatus === 'cancelled') return 'INSURANCE_CANCELLED'
  return 'CLEAR'
}

module.exports = { buildVehicleProfile }