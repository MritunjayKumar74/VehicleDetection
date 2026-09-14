const mongoose = require('mongoose')

const TheftRecordSchema = new mongoose.Schema({
  number_plate: String,
  status: String,
  reported_date: Date,
  fir_number: String,
  police_station: String,
  shredded_by: String,
  shredding_date: Date,
  remarks: String
})

module.exports = mongoose.model('TheftRecord', TheftRecordSchema)