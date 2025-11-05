/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import mongoose from 'mongoose'
import { middleware } from '#start/kernel'
import MongoDbUsers from '#models/mongodbUsers'
import * as bcrypt from 'bcryptjs'  
import { Types } from 'mongoose'
const isObjectId = (id: string) => Types.ObjectId.isValid(id)

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

// start/routes.ts

router.get('/mongo/health', () => {
  const map: Record<number, string> = {0:'disconnected',1:'connected',2:'connecting',3:'disconnecting'}
  return {
    status: map[mongoose.connection.readyState],
    host: mongoose.connection.host,
    db: mongoose.connection.name,
  }
})

router.get('/mongo/where', () => ({
  host: mongoose.connection.host,
  db: mongoose.connection.name,
  status: ['disconnected','connected','connecting','disconnecting'][mongoose.connection.readyState],
}))

router.get('/mongo/users', async ({ request }) => {
  const mask = (request.qs().mask ?? 'true') !== 'false'
  const docs = await MongoDbUsers.find({}, { _id: 1, name: 1, email: 1, password: 1 })
    .sort({ name: 1 })
    .collation({ locale: 'en', strength: 1 })
    .lean()

  const data = docs.map((u: any) => ({
    _id: u._id?.toString?.() ?? u._id,
    name: u.name ?? null,
    email: u.email ?? null,
    password: mask && typeof u.password === 'string' ? u.password.slice(0, 6) + '…' : u.password,
  }))

  return { total: data.length, data }
})

// GET /api/users
router.get('/api/users', async ({ request }) => {
  const mask = (request.qs().mask ?? 'true') !== 'false' // default masking password

  const docs = await MongoDbUsers.find({}, { _id: 1, name: 1, email: 1, password: 1 })
    .sort([['name', 'asc']])                     // ASC
    .collation({ locale: 'en', strength: 1 })    // case-insensitive
    .lean()

  const data = docs.map((u: any) => ({
    _id: u._id?.toString?.() ?? u._id,
    name: u.name ?? null,
    email: u.email ?? null,
    password: mask && typeof u.password === 'string' ? u.password.slice(0, 6) + '…' : u.password,
  }))

  return { total: data.length, data }
}).use([middleware.apiKey()]) 

// GET /api/users/:id
router.get('/api/users/:id', async ({ params, response, request }) => {
  const { id } = params
  if (!isObjectId(id)) return response.badRequest({ error: 'Invalid user id' })

  const mask = (request.qs().mask ?? 'true') !== 'false'

  const doc = await MongoDbUsers.findById(id, { _id: 1, name: 1, email: 1, password: 1 }).lean()
  if (!doc) return response.notFound({ error: 'User tidak ditemukan' })

  return {
    _id: doc._id?.toString?.() ?? doc._id,
    name: doc.name ?? null,
    email: doc.email ?? null,
    password: mask && typeof doc.password === 'string' ? doc.password.slice(0, 6) + '…' : doc.password,
  }
}).use([middleware.apiKey()])

// POST /api/users
router.post('/api/users', async ({ request, response }) => {
  const { name, email, password } = request.only(['name', 'email', 'password'])

  // --- validasi sederhana ---
  if (!name || !email || !password) {
    return response.badRequest({ error: 'name, email, dan password wajib diisi' })
  }
  // email format minimal
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.badRequest({ error: 'Format email tidak valid' })
  }

  // cek duplikat email
  const exists = await MongoDbUsers.exists({ email })
  if (exists) {
    return response.conflict({ error: 'Email sudah terdaftar' })
  }

  // --- hashing password (default: aktif) ---
  const shouldHash = (request.qs().hash ?? 'true') !== 'false'
  const finalPassword =
    shouldHash && typeof password === 'string' && !password.startsWith('$2')
      ? await bcrypt.hash(password, 12)
      : password

  // insert
  try {
    const doc = await MongoDbUsers.create({ name, email, password: finalPassword })
    return response.created({
      _id: doc._id.toString(),
      name: doc.name,
      email: doc.email,
      // jangan kembalikan password ke client (aman)
    })
  } catch (err: any) {
    // handle duplicate key dari index unik
    if (err?.code === 11000) {
      return response.conflict({ error: 'Email sudah terdaftar (dup key)' })
    }
    return response.internalServerError({ error: err?.message || 'Insert gagal' })
  }
}).use([middleware.apiKey()])

// PUT /api/users/:id
router.put('/api/users/:id', async ({ params, request, response }) => {
  const { id } = params
  if (!isObjectId(id)) return response.badRequest({ error: 'Invalid user id' })

  // ambil hanya field yg boleh diubah
  const payload = request.only(['name', 'email', 'password'])

  if (!Object.keys(payload).length) {
    return response.badRequest({ error: 'Tidak ada field yang diupdate' })
  }

  // validasi ringan
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return response.badRequest({ error: 'Format email tidak valid' })
  }

  // cegah duplikat email (email milik user lain)
  if (payload.email) {
    const dup = await MongoDbUsers.exists({ _id: { $ne: id }, email: payload.email })
    if (dup) return response.conflict({ error: 'Email sudah dipakai user lain' })
  }

  // opsi hashing password (default: true)
  const shouldHash = (request.qs().hash ?? 'true') !== 'false'
  if (payload.password && shouldHash && !payload.password.startsWith('$2')) {
    payload.password = await bcrypt.hash(payload.password, 12)
  }

  // lakukan update
  const updated = await MongoDbUsers.findByIdAndUpdate(
    id,
    { $set: payload },
    { new: true, projection: { _id: 1, name: 1, email: 1 } }
  )

  if (!updated) return response.notFound({ error: 'User tidak ditemukan' })

  return {
    _id: updated._id.toString(),
    name: updated.name,
    email: updated.email,
  }
}).use([middleware.apiKey()])

// DELETE /api/users/:id
router.delete('/api/users/:id', async ({ params, response }) => {
  const { id } = params
  if (!isObjectId(id)) return response.badRequest({ error: 'Invalid user id' })

  const deleted = await MongoDbUsers.findByIdAndDelete(id, {
    projection: { _id: 1, name: 1, email: 1 },
  })

  if (!deleted) return response.notFound({ error: 'User tidak ditemukan' })

  return {
    _id: deleted._id.toString(),
    name: deleted.name,
    email: deleted.email,
  }
}).use([middleware.apiKey()])