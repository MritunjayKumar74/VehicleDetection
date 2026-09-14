const mongoose = require('mongoose')

const CameraSightingSchema = new mongoose.Schema({
  plate_number: String,
  capture_timestamp: Date,
  camera_id: String,
  location: String,
  vehicle_color: String,
  vehicle_type: String
})

module.exports = mongoose.model('CameraSighting', CameraSightingSchema)