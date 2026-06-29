import User from '../models/User.js'
import { hash, compare } from '../utils/hashPassword.js'
import { assertPasswordStrength } from '../utils/validators.js'
import { validateEmailReputation } from '../utils/emailReputationService.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'

const err = (msg, code) => Object.assign(new Error(msg), { statusCode: code })

export const assertAccountActive = (user) => {
  if (user?.isBlocked) throw err(ERRORS.ACCOUNT_BLOCKED, STATUS.FORBIDDEN)
}

export const registerFcmToken = async (userId, fcmToken) => {
  // Passing null deliberately clears the token (user logs out / disables notifications)
  const user = await User.findByIdAndUpdate(
    userId,
    { fcmToken: fcmToken || null },
    { returnDocument: 'after' }
  ).select('_id fcmToken')
  if (!user) throw err(ERRORS.USER_NOT_FOUND, STATUS.NOT_FOUND)
  return user
}

export const registerUser = async ({ name, email, password }) => {
  await validateEmailReputation(email)

  const existing = await User.findOne({ email })
  if (existing) throw err(ERRORS.EMAIL_TAKEN, STATUS.CONFLICT)
  const hashed = await hash(password)
  return User.create({ name, email, password: hashed })
}

export const authenticate = async ({ email, password }) => {
  const user = await User.findOne({ email })
  if (!user) throw err(ERRORS.INVALID_CREDENTIALS, STATUS.UNAUTHORIZED)
  const matched = await compare(password, user.password)
  if (!matched) throw err(ERRORS.INVALID_CREDENTIALS, STATUS.UNAUTHORIZED)
  assertAccountActive(user)
  return user
}

export const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId).select('+password')
  if (!user) throw err(ERRORS.USER_NOT_FOUND, STATUS.NOT_FOUND)

  const matched = await compare(currentPassword, user.password)
  if (!matched) throw err(ERRORS.WRONG_CURRENT_PASSWORD, STATUS.BAD_REQUEST)

  assertPasswordStrength(newPassword)

  user.password          = await hash(newPassword)
  user.passwordChangedAt = new Date()
  await user.save()

  return user
}

export const updateProfile = async (userId, { name, email, password, phone, city, address }) => {
  const existing = await User.findById(userId).select('role city')
  if (!existing) throw err(ERRORS.USER_NOT_FOUND, STATUS.NOT_FOUND)

  const updates = {}
  if (name) updates.name = name
  if (phone   !== undefined) updates.phone   = phone
  // Sub-admin managed city — never allow clearing once set via profile
  if (city !== undefined) {
    const nextCity = city ? city.trim().toLowerCase() : null
    if (existing.role === 'subadmin') {
      if (nextCity) {
        updates.city = nextCity
      } else if (!existing.city) {
        updates.city = null
      }
      // else: ignore empty city payload so profile saves cannot wipe managed city
    } else {
      updates.city = nextCity
    }
  }
  if (address !== undefined) {
    updates.address = { ...address }
    if (updates.address.city) {
      updates.address.city = updates.address.city.trim().toLowerCase()
    }
    if (updates.address.state) {
      updates.address.state = updates.address.state.trim().toLowerCase()
    }
  }

  if (email) {
    await validateEmailReputation(email)

    // Pre-check: is this email already taken by a DIFFERENT user?
    const existing = await User.findOne({ email, _id: { $ne: userId } })
    if (existing) throw err(ERRORS.EMAIL_TAKEN, STATUS.CONFLICT)
    updates.email = email
  }

  if (password) {
    updates.password          = await hash(password)
    updates.passwordChangedAt = new Date()
  }

  try {
    const user = await User.findByIdAndUpdate(userId, updates, { returnDocument: 'after', runValidators: true }).select('-password')
    if (!user) throw err(ERRORS.USER_NOT_FOUND, STATUS.NOT_FOUND)
    return user
  } catch (e) {
    // Catch the rare race where two concurrent requests both pass the pre-check
    // and the second hits the unique index — surface as a clean 409
    if (e.code === 11000) throw err(ERRORS.EMAIL_TAKEN, STATUS.CONFLICT)
    throw e
  }
}
