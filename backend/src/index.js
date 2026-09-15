const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
require('dotenv').config()

const vehicleRoutes = require('./routes/vehicle')
const { connectMongo } = require('./connectors/mongo')
const { connectPostgres } = require('./connectors/postgres')
const { connectMySQL } = require('./connectors/mysql')
const schemaRoutes = require('./routes/schema')
const app = express()
app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.json({ message: 'Vehicle Detection API running' })
})

app.use('/api/vehicle', vehicleRoutes)
app.use('/api/schema', schemaRoutes)
app.use('/api/db', require('./routes/dbEditor'))

const PORT = process.env.PORT || 5000
const MONGO_URI = process.env.MONGO_URI

async function start() {
  try {
    await mongoose.connect(MONGO_URI)
    console.log('Connected to MongoDB (default)')

    await connectMongo()
    await connectPostgres()
    await connectMySQL()

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
  } catch (err) {
    console.error('Startup error:', err)
    process.exit(1)
  }
}

start()