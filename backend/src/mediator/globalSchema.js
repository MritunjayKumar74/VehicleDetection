/**
 * GLOBAL SCHEMA BUILDER — GAV Mediated Schema
 * Takes raw results from all 5 sources and merges
 * them into a single canonical VehicleProfile object.
 */

function buildVehicleProfile(plate, { camera, insurance, registration, theft, mot }) {
  const now = new Date()

  // ── Derive insurance status ───────────────────────────────────
  let insuranceStatus = 'uninsured'
  if (insurance) {
    const expiry = new Date(insurance.expiry_date)
    if (!insurance.is_active)          insuranceStatus = 'cancelled'
    else if (expiry < now)             insuranceStatus = 'expired'
    else                               insuranceStatus = 'active'
  }

  // ── Derive theft status ───────────────────────────────────────
  const stolenStatus = theft ? theft.status : null

  // ── Derive MOT flag ───────────────────────────────────────────
  const motFlagged = mot ? mot.report_type : null

  return {
    // identity
    plate,

    // from DB3 — RTO (registration)
    owner:             registration?.owner_name        || null,
    owner_address:     registration?.owner_address     || null,
    owner_contact:     registration?.owner_contact     || null,
    vehicle_make:      registration?.vehicle_make      || null,
    vehicle_model:     registration?.vehicle_model     || null,
    fuel_type:         registration?.fuel_type         || null,
    year_of_manufacture: registration?.year_of_manufacture || null,
    engine_number:     registration?.engine_number     || null,
    chassis_number:    registration?.chassis_number    || null,
    registration_date: registration?.registration_date || null,
    registered:        !!registration,

    // from DB2 — Insurance (PostgreSQL)
    insurance_status:  insuranceStatus,
    insurer:           insurance?.insurer_company      || null,
    policy_type:       insurance?.policy_type          || null,
    insurance_start:   insurance?.start_date           || null,
    insurance_expiry:  insurance?.expiry_date          || null,
    premium_amount:    insurance?.premium_amount       || null,

    // from DB4 — Theft (MongoDB)
    stolen:            stolenStatus === 'stolen',
    theft_status:      stolenStatus,
    fir_number:        theft?.fir_number               || null,
    police_station:    theft?.police_station           || null,
    theft_reported:    theft?.reported_date            || null,

    // from DB5 — MOT (PostgreSQL)
    mot_flagged:       motFlagged,
    mot_action:        mot?.action_taken               || null,
    mot_resolved:      mot?.resolved                   || false,
    mot_report_date:   mot?.report_date                || null,

    // from DB1 — Camera (MongoDB)
    sighted_at:        camera?.location                || null,
    sighted_when:      camera?.capture_timestamp       || null,
    camera_id:         camera?.camera_id               || null,
    vehicle_color:     camera?.vehicle_color           || null,
    vehicle_type:      camera?.vehicle_type            || null,

    // meta
    overall_status: deriveOverallStatus(insuranceStatus, stolenStatus, !!registration),
    profile_built_at: now.toISOString(),
  }
}

function deriveOverallStatus(insuranceStatus, stolenStatus, registered) {
  if (stolenStatus === 'stolen')      return 'STOLEN'
  if (!registered)                    return 'UNREGISTERED'
  if (insuranceStatus === 'uninsured') return 'UNINSURED'
  if (insuranceStatus === 'expired')   return 'INSURANCE_EXPIRED'
  if (insuranceStatus === 'cancelled') return 'INSURANCE_CANCELLED'
  return 'CLEAR'
}

module.exports = { buildVehicleProfile }