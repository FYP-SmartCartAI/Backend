import multer from 'multer'
import { CloudinaryStorage } from 'multer-storage-cloudinary'
import cloudinary from '../config/cloudinary.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'

// ── Shared error handler ──────────────────────────────────────────────────────
const multerErrorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(STATUS.BAD_REQUEST).json({ message: err.message })
  }
  if (err) {
    return res.status(STATUS.BAD_REQUEST).json({ message: err.message })
  }
  next()
}

// ── Product images ────────────────────────────────────────────────────────────
// Stored in:  cloudinary/smartcart/products/<public_id>
// Format:     auto (Cloudinary picks webp/avif based on browser support)
// Max 6 images per upload, each ≤ 5 MB
const productStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:         'smartcart/products',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1000, crop: 'limit' }],   // cap at 1 000 px wide
  },
})

const productUpload = multer({
  storage: productStorage,
  limits:  { fileSize: 5 * 1024 * 1024 },   // 5 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false)
    }
    cb(null, true)
  },
})

// ── User avatar ───────────────────────────────────────────────────────────────
// Stored in:  cloudinary/smartcart/avatars/<public_id>
// Single file, square-cropped to 300 × 300, max 2 MB
const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:         'smartcart/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 300, height: 300, crop: 'fill', gravity: 'face' }],
  },
})

const avatarUpload = multer({
  storage: avatarStorage,
  limits:  { fileSize: 2 * 1024 * 1024 },   // 2 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false)
    }
    cb(null, true)
  },
})

export { productUpload, avatarUpload, multerErrorHandler }
