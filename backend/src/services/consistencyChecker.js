function normalize(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  return String(value).trim().toLowerCase()
}

function checkField(field, values) {
  const available = values.filter(
    item =>
      item.value !== null &&
      item.value !== undefined &&
      item.value !== ''
  )

  if (available.length < 2) {
    return {
      field,
      status: 'insufficient-data',
      values: available
    }
  }

  const uniqueValues = [
    ...new Set(
      available.map(item => normalize(item.value))
    )
  ]

  return {
    field,
    status: uniqueValues.length === 1
      ? 'consistent'
      : 'conflict',
    values: available
  }
}

function checkVehicleConsistency({
  registration,
  insurance
}) {
  return [
    checkField('Make', [
      {
        source: 'RTO',
        value: registration?.vehicle_make
      },
      {
        source: 'Insurance',
        value: insurance?.vehicle_make
      }
    ]),

    checkField('Model', [
      {
        source: 'RTO',
        value: registration?.vehicle_model
      },
      {
        source: 'Insurance',
        value: insurance?.vehicle_model
      }
    ]),

    checkField('Year of Manufacture', [
      {
        source: 'RTO',
        value: registration?.year_of_manufacture
      },
      {
        source: 'Insurance',
        value: insurance?.year_of_manufacture
      }
    ])
  ]
}

module.exports = {
  checkVehicleConsistency
}