import { validationResult } from 'express-validator'
import { STATUS, ERRORS } from '../constants/httpConstants.js'

export const runValidation = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(STATUS.UNPROCESSABLE).json({ errors: errors.array() })
  }
  next()
}

export const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly:    false,
    stripUnknown:  true,
    convert:       true,
  })

  if (error) {
    const messages = error.details.map(d => d.message)
    return res.status(STATUS.UNPROCESSABLE).json({
      success: false,
      message: ERRORS.VALIDATION_FAILED,
      errors:  messages,
    })
  }

  req.body = value
  next()
}
