const mongoose = require('mongoose')
const { Schema } = mongoose
const ref = (model) => ({ type: Schema.Types.ObjectId, ref: model, required: true, index: true })

// DB1 cameradb: five collections. References are application-validated (MongoDB has no FK constraints).
const CameraLocationSchema = new Schema({ name: { type: String, required: true }, city: String, route: String }, { timestamps: true, collection: 'p3_locations' })
const CameraDeviceSchema = new Schema({ camera_code: { type: String, required: true, unique: true }, location_id: ref('P3CameraLocation'), status: { type: String, default: 'active' } }, { timestamps: true, collection: 'p3_cameras' })
const ObservedVehicleSchema = new Schema({ plate_raw: { type: String, required: true }, plate_normalized: { type: String, required: true, index: true }, vehicle_color: String, vehicle_type: String, make: String, model: String }, { timestamps: true, collection: 'p3_observed_vehicles' })
const Phase3CameraSightingSchema = new Schema({ camera_id: ref('P3CameraDevice'), vehicle_id: ref('P3ObservedVehicle'), capture_timestamp: { type: Date, required: true, index: true }, ocr_confidence: Number }, { timestamps: true, collection: 'p3_camera_sightings' })
const SightingMediaSchema = new Schema({ sighting_id: ref('P3CameraSighting'), media_uri: String, media_type: String, extracted_text: String, metadata: Schema.Types.Mixed }, { timestamps: true, collection: 'p3_sighting_media' })

// DB4 theftdb: five collections. case_updates.notes is text for the later unstructured-search task.
const PoliceStationSchema = new Schema({ station_code: { type: String, unique: true }, name: { type: String, required: true }, district: String }, { timestamps: true, collection: 'p3_police_stations' })
const ReportedVehicleSchema = new Schema({ plate_raw: { type: String, required: true }, plate_normalized: { type: String, required: true, index: true }, make: String, model: String, color: String }, { timestamps: true, collection: 'p3_reported_vehicles' })
const TheftCaseSchema = new Schema({ fir_number: { type: String, required: true, unique: true }, station_id: ref('P3PoliceStation'), reported_at: Date, case_status: String }, { timestamps: true, collection: 'p3_theft_cases' })
const CaseVehicleSchema = new Schema({ case_id: ref('P3TheftCase'), vehicle_id: ref('P3ReportedVehicle'), role: { type: String, default: 'stolen_vehicle' }, reported_status: String }, { timestamps: true, collection: 'p3_case_vehicles' })
const CaseUpdateSchema = new Schema({ case_id: ref('P3TheftCase'), updated_at: { type: Date, default: Date.now }, status: String, notes: String }, { timestamps: true, collection: 'p3_case_updates' })

module.exports = { CameraLocationSchema, CameraDeviceSchema, ObservedVehicleSchema, Phase3CameraSightingSchema, SightingMediaSchema, PoliceStationSchema, ReportedVehicleSchema, TheftCaseSchema, CaseVehicleSchema, CaseUpdateSchema }
