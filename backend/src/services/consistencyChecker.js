function checkField(field, values) {
  const validValues = values.filter(
    v => v.value !== null &&
         v.value !== undefined &&
         v.value !== ''
  )

  if (validValues.length < 2) {
    return {
      field,
      status: 'insufficient-data',
      values: validValues
    }
  }

  const normalized = validValues.map(v =>
    String(v.value).trim().toLowerCase()
  )

  const uniqueValues = [...new Set(normalized)]

  if (uniqueValues.length === 1) {
    return {
      field,
      status: 'consistent',
      values: validValues
    }
  }

  return {
    field,
    status: 'conflict',
    values: validValues
  }
}


function checkVehicleConsistency(profile) {

  const checks = []

  checks.push(
    checkField('Make', [
      {
        source: 'RTO',
        value: profile.vehicle_make
      },
      {
        source: 'Insurance',
        value: profile.insurer_vehicle_make
      },
      {
        source: 'Camera',
        value: profile.camera_vehicle_make
      }
    ])
  )

  checks.push(
    checkField('Model', [
      {
        source: 'RTO',
        value: profile.vehicle_model
      },
      {
        source: 'Insurance',
        value: profile.insurer_vehicle_model
      },
      {
        source: 'Camera',
        value: profile.camera_vehicle_model
      }
    ])
  )

  return checks
}


module.exports = {
  checkVehicleConsistency
}