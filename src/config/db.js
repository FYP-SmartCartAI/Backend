import mongoose from 'mongoose'
import { MONGO_URI } from './env.js'

const connectDB = async () => {
  if (!MONGO_URI) return console.warn('MONGO_URI not set')
  try {
    console.log('Attempting background connection to MongoDB Atlas...')
    
    // Disable operation buffering so queries fail fast instead of freezing threads
    await mongoose.connect(MONGO_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000 // Timeout quickly (5s) if cluster is unreachable
    })
    
    console.log('MongoDB connected successfully ✅')
  } catch (err) {
    console.error('MongoDB connection error ❌:', err.message)
  }
}

export default connectDB