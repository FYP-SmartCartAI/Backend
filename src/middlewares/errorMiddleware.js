import { STATUS, ERRORS } from '../constants/httpConstants.js'

const errorMiddleware = (err, req, res, next) => {  // eslint-disable-line no-unused-vars
  let statusCode = err.status || err.statusCode || STATUS.INTERNAL_ERROR

  // Mongoose bad ObjectId  →  404
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = STATUS.NOT_FOUND
    err.message = `Resource not found (invalid id: ${err.value})`
  }

  // Mongoose duplicate key  →  409 Conflict
  if (err.code === 11000) {
    statusCode = STATUS.CONFLICT
    const field = Object.keys(err.keyValue || {})[0] || 'field'
    err.message = `Duplicate value for '${field}'`
  }

  // Mongoose validation error  →  422 Unprocessable Entity
  if (err.name === 'ValidationError') {
    statusCode = STATUS.UNPROCESSABLE
    const messages = Object.values(err.errors).map((e) => e.message)
    err.message = messages.join('. ')
  }

  // JWT errors  →  401
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = STATUS.UNAUTHORIZED
    err.message = err.name === 'TokenExpiredError' ? ERRORS.TOKEN_EXPIRED : ERRORS.TOKEN_INVALID
  }

  // Multer file upload errors  →  400
  // MulterError is thrown by multer for size limits, unexpected fields, etc.
  if (err.name === 'MulterError') {
    statusCode = STATUS.BAD_REQUEST
    const readable = {
      LIMIT_FILE_SIZE:  'File is too large. Check the maximum allowed size.',
      LIMIT_FILE_COUNT: 'Too many files uploaded at once.',
      LIMIT_UNEXPECTED_FILE: `Unexpected file field: '${err.field}'.`,
    }
    err.message = readable[err.code] || `File upload error: ${err.message}`
  }

  // Payload too large (express body-parser limit: '10kb')  →  413
  if (err.type === 'entity.too.large') {
    statusCode = 413
    err.message = 'Request body exceeds the maximum allowed size (10 kb).'
  }

  const body = {
    success: false,
    message: err.message || ERRORS.INTERNAL,
  }

  if (err.errors?.length) body.errors = err.errors

  if (process.env.NODE_ENV === 'development') body.stack = err.stack

  if (process.env.NODE_ENV !== 'test') {
    console.error(`[${statusCode}] ${err.message}`)
    if (process.env.NODE_ENV === 'development') console.error(err.stack)
  }

  res.status(statusCode).json(body)
}

export default errorMiddleware
