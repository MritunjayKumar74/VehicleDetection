const mongoose = require('mongoose')

let cameraDb, theftDb

async function connectMongo() {
  const client = await mongoose.createConnection(`${process.env.MONGO_URI}/cameradb`).asPromise()
  cameraDb = client

  const theftClient = await mongoose.createConnection(`${process.env.MONGO_URI}/theftdb`).asPromise()
  theftDb = theftClient

  console.log('[DB1] MongoDB cameradb connected')
  console.log('[DB4] MongoDB theftdb connected')
}

function getCameraDb() { return cameraDb }
function getTheftDb()  { return theftDb  }

module.exports = { connectMongo, getCameraDb, getTheftDb }