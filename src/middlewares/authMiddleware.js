import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { JWT_SECRET } from '../config/env.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'
import { assertAccountActive } from '../services/authService.js'

export const protect = async (req, res, next) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer '))
      return res.status(STATUS.UNAUTHORIZED).json({ message: ERRORS.NOT_AUTHORIZED })

    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET)
    const user = await User.findById(decoded.id).select('-password -passwordResetToken -passwordResetExpires')
    if (!user) return res.status(STATUS.UNAUTHORIZED).json({ message: ERRORS.NOT_AUTHORIZED })

    if (user.passwordChangedAt) {
      const changedAt = Math.floor(user.passwordChangedAt.getTime() / 1000)
      if (decoded.iat < changedAt)
        return res.status(STATUS.UNAUTHORIZED).json({ message: ERRORS.PASSWORD_CHANGED })
    }

    try {
      assertAccountActive(user)
    } catch (blockedErr) {
      return res.status(blockedErr.statusCode).json({ message: blockedErr.message })
    }

    req.user = user
    next()
  } catch (err) {
    return res.status(STATUS.UNAUTHORIZED).json({ message: ERRORS.NOT_AUTHORIZED, error: err.message })
  }
}
