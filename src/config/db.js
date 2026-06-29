import mongoose from 'mongoose'
import { MONGO_URI } from './env.js'

const connectDB = async () => {
  if (!MONGO_URI) return console.warn('MONGO_URI not set')
  try {
    // modern mongoose accepts the uri and optional options object; many legacy options are deprecated
    await mongoose.connect(MONGO_URI)
    console.log('MongoDB connected')
  } catch (err) {
    console.error('MongoDB connection error:', err.message)
    // Don't exit immediately in dev - let the server run for easier debugging
  }
}

export default connectDB
