import mongoose from 'mongoose'

// ── Embedded address sub-schema ───────────────────────────────────────────────
const addressSchema = new mongoose.Schema({
  street:     { type: String, default: '' },
  city:       { type: String, default: '' },   // ← used to route support tickets
  state:      { type: String, default: '' },
  postalCode: { type: String, default: '' },    // zip / postal code
  country:    { type: String, default: '' },
}, { _id: false })

const userSchema = new mongoose.Schema({
  // ── Core identity ─────────────────────────────────────────────────────────
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, default: null }, // null for OAuth users

  // ── Contact ───────────────────────────────────────────────────────────────
  phone:    { type: String, default: null }, // optional — for COD delivery contact

  // ── Role & city ───────────────────────────────────────────────────────────
  // 'subadmin' requires city to be set; only admin can set role = 'subadmin'.
  role:     { type: String, enum: ['user', 'subadmin', 'admin'], default: 'user' },
  city:     { type: String, default: null }, // which city this subadmin manages

  // ── Address ───────────────────────────────────────────────────────────────
  address:  { type: addressSchema, default: () => ({}) },

  // ── OAuth fields ──────────────────────────────────────────────────────────
  googleId:   { type: String, default: null },
  facebookId: { type: String, default: null },
  avatar:     { type: String, default: null }, // Cloudinary URL or OAuth picture
  provider:   { type: String, enum: ['local', 'google', 'facebook'], default: 'local' },

  // ── Password reset ────────────────────────────────────────────────────────
  passwordResetToken:   { type: String, default: null }, // hashed token from email link
  passwordResetExpires: { type: Date,   default: null }, // 10-minute expiry window

  // ── JWT invalidation on password change ───────────────────────────────────
  passwordChangedAt: { type: Date, default: null },

  // ── Account status ─────────────────────────────────────────────────────────
  isVerified: { type: Boolean, default: false }, // true after email verification
  isBlocked:  { type: Boolean, default: false }, // admin can block/unblock accounts

  // ── Firebase push notifications ───────────────────────────────────────────
  fcmToken: { type: String, default: null }, // device token registered after login

  // ── AI taste profile (Pinecone user-profiles namespace) ───────────────────
  profileSynced: { type: Boolean, default: false },
}, { timestamps: true })

userSchema.index({ profileSynced: 1 })

export default mongoose.model('User', userSchema)
