import Joi from 'joi'
import { PAKISTAN_CITIES_LC } from '../constants/pakistanCities.js'
import { PAKISTAN_PROVINCES_LC } from '../constants/pakistanProvinces.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'

// City must be one of the supported Pakistani cities (case-insensitive).
// `.lowercase()` normalizes the input before checking against the lowercase list.
const pkCity = Joi.string().lowercase().valid(...PAKISTAN_CITIES_LC).messages({
  'any.only': 'Please select a valid Pakistani city',
})

const pkProvince = Joi.string().lowercase().valid(...PAKISTAN_PROVINCES_LC).messages({
  'any.only': 'Please select a valid Pakistani province',
})

// ── Reusable field rules ───────────────────────────────────────────────────────

const password = Joi.string()
  .min(8)
  .max(25)
  .pattern(/[A-Z]/,          'uppercase letter')
  .pattern(/[a-z]/,          'lowercase letter')
  .pattern(/[0-9]/,          'number')
  .pattern(/[^A-Za-z0-9]/,  'special character')
  .messages({
    'string.min':       'Password must be at least 8 characters',
    'string.max':       'Password must be at most 25 characters',
    'string.pattern.name': 'Password must contain at least one {#name}',
  })

/** Run after current-password check so wrong-current errors take priority. */
export const assertPasswordStrength = (value) => {
  const { error } = password.validate(value)
  if (!error) return
  const messages = error.details.map((d) => d.message)
  throw Object.assign(new Error(ERRORS.VALIDATION_FAILED), {
    statusCode: STATUS.UNPROCESSABLE,
    errors:     messages,
  })
}

const email = Joi.string().email({ tlds: { allow: false } }).lowercase().messages({
  'string.email': 'Please provide a valid email address',
})

// ── Auth schemas ───────────────────────────────────────────────────────────────

export const registerSchema = Joi.object({
  name:     Joi.string().min(2).max(50).required(),
  email:    email.required(),
  password: password.required(),
})

export const createUserSchema = Joi.object({
  name:     Joi.string().min(2).max(50).required(),
  email:    email.required(),
  password: password.required(),
  role:     Joi.string().valid('user', 'subadmin', 'admin').required(),
  city:     Joi.when('role', {
              is: 'subadmin',
              then: pkCity.required(),
              otherwise: Joi.string().optional().allow(null, '')
            })
})

export const loginSchema = Joi.object({
  email:    email.required(),
  password: Joi.string().required(),   // no strength check on login — just presence
})

export const updateProfileSchema = Joi.object({
  name:     Joi.string().min(2).max(50),
  email:    email,
  password: password,
  phone:    Joi.string().allow('').max(20),
  city:     pkCity.allow(''),
  address:  Joi.object({
    street:     Joi.string().allow('').max(200),
    city:       pkCity.allow(''),
    state:      pkProvince.allow(''),
    postalCode: Joi.string().allow('').max(20),
    country:    Joi.string().allow('').max(60),
  }),
}).min(1).messages({          // at least one field must be present
  'object.min': 'Provide at least one field to update',
})

// ── Product schema ─────────────────────────────────────────────────────────────

export const createProductSchema = Joi.object({
  name:        Joi.string().min(2).max(200).required(),
  price:       Joi.number().positive().required(),
  category:    Joi.string().required(),
  subcategory: Joi.string().allow(''),
  brand:       Joi.string().max(100).allow(''),
  tags:        Joi.array().items(Joi.string().max(50)).max(20),
  description: Joi.string().max(2000),
  stock:       Joi.number().integer().min(0),
  images:      Joi.array().items(Joi.string().uri()),
})

export const updateProductSchema = createProductSchema.fork(
  ['name', 'price', 'category'],
  (field) => field.optional()
)

// ── Category schema ────────────────────────────────────────────────────────────

export const categorySchema = Joi.object({
  name:        Joi.string().min(2).max(100).required(),
  description: Joi.string().max(500).allow(''),
  image:       Joi.string().uri().allow(''),
})

export const subcategorySchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
})

// ── Order schema ───────────────────────────────────────────────────────────────

const shippingAddressSchema = Joi.object({
  street:     Joi.string().allow(''),
  city:       pkCity.required().messages({ 'any.required': 'shippingAddress.city is required' }),
  state:      pkProvince.allow(''),
  postalCode: Joi.string().allow(''),
  country:    Joi.string().allow(''),
})

export const checkoutSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      product:  Joi.string().required(),
      quantity: Joi.number().integer().min(1).required(),
    })
  ).min(1).required(),
  shippingAddress: shippingAddressSchema.required(),
  paymentMethod:   Joi.string().valid('stripe', 'cod').default('stripe'),
})

// ── Review schema ──────────────────────────────────────────────────────────────

export const reviewSchema = Joi.object({
  rating:  Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().min(3).max(1000).required(),
})

// ── Password reset schemas ─────────────────────────────────────────────────────

export const forgotPasswordSchema = Joi.object({
  email: email.required(),
})

export const resetPasswordSchema = Joi.object({
  token:    Joi.string().required(),
  password: password.required(),
})

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    'any.required': 'Current password is required',
    'string.empty': 'Current password is required',
  }),
  newPassword: Joi.string().required().messages({
    'any.required': 'New password is required',
    'string.empty': 'New password is required',
  }),
})

// ── Ticket schemas ─────────────────────────────────────────────────────────────

export const createTicketSchema = Joi.object({
  orderId: Joi.string().hex().length(24),   // optional MongoDB ObjectId
  subject: Joi.string().allow('').max(200), // optional title (e.g. "Order #D43E74")
  message: Joi.string().min(1).max(2000).required(),
})

export const sendMessageSchema = Joi.object({
  message: Joi.string().min(1).max(2000).required(),
})

// ── FCM token schema ───────────────────────────────────────────────────────────
// fcmToken can be a string (register device) or null (deregister).

export const fcmTokenSchema = Joi.object({
  fcmToken: Joi.string().max(512).allow(null).default(null),
})

// ── Behavior log schema ────────────────────────────────────────────────────────
// Used by POST /api/behaviors (manual client-side actions: view, wishlist, search)
// purchase and add_to_cart are auto-logged server-side.

export const behaviorSchema = Joi.object({
  productId:       Joi.string().hex().length(24).allow(null).default(null),
  action:          Joi.string()
                     .valid('view', 'add_to_cart', 'remove_from_cart', 'purchase', 'wishlist', 'review', 'search')
                     .required(),
  query:           Joi.string().max(200).allow(null, '').default(null),
  rating:          Joi.number().integer().min(1).max(5).allow(null).default(null),
  durationSeconds: Joi.number().integer().min(0).allow(null).default(null),
  price:           Joi.number().positive().allow(null).default(null),
})
