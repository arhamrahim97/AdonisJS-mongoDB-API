import mongoose, { Schema, InferSchemaType } from 'mongoose'

const MongoDbUsersSchema = new Schema(
  {
    name: String,
    email: { type: String, index: true, sparse: true },
    password: String,
  },
  {
    collection: 'users',     // sample_mflix.users
    versionKey: false,
    strict: false,
    timestamps: false,
  }
)

export type MongoDbUsersDoc = InferSchemaType<typeof MongoDbUsersSchema>
export default mongoose.connection.model<MongoDbUsersDoc>('MongoDbUsers', MongoDbUsersSchema)
