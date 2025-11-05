import mongoose from 'mongoose'
import env from '#start/env'

export async function connectMongo() {
  const url = env.get('MONGO_URL')!
  const dbName = env.get('MONGO_DB_NAME', 'test') as string

  const opts: mongoose.ConnectOptions = {
    dbName,                           
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8000,
  }

  try {
    await mongoose.connect(url, opts)
    const c = mongoose.connection
    console.log(`✅ Mongo connected → ${c.host}/${c.name}`)
    c.on('disconnected', () => console.warn('⚠️ Mongo disconnected'))
    c.on('reconnected', () => console.log('🔁 Mongo reconnected'))
  } catch (err) {
    console.error('❌ Mongo connect failed:', (err as Error).message)
  }
}
