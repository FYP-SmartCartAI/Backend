import * as productService from '../services/productService.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'
import cloudinary from '../config/cloudinary.js'
import Product from '../models/Product.js'
import { syncProductVector } from '../services/vectorService.js'
import { syncAllUserProfiles, getUserProfileSyncStats } from '../services/behaviorService.js'
import { randomUUID } from 'crypto'

let currentSyncStatus = {
  status: 'idle', // 'idle' | 'running' | 'completed' | 'failed'
  lastSync: null,
  error: null,
}

export const getAllProducts = async (req, res, next) => {
  try {
    const products = await productService.getAll(req.query)
    res.json({ success: true, data: products })
  } catch (err) {
    next(err)
  }
}

export const getProductFacets = async (req, res, next) => {
  try {
    const facets = await productService.getFacets()
    res.json({ success: true, data: facets })
  } catch (err) {
    next(err)
  }
}

export const getProduct = async (req, res, next) => {
  try {
    const p = await productService.getById(req.params.id)
    res.json({ success: true, data: p })
  } catch (err) {
    next(err)
  }
}

export const createProduct = async (req, res, next) => {
  try {
    const p = await productService.create(req.body)
    res.status(STATUS.CREATED).json({ success: true, data: p })
  } catch (err) {
    next(err)
  }
}

export const updateProduct = async (req, res, next) => {
  try {
    const p = await productService.update(req.params.id, req.body)
    res.json({ success: true, data: p })
  } catch (err) {
    next(err)
  }
}

export const deleteProduct = async (req, res, next) => {
  try {
    await productService.remove(req.params.id)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}

export const searchProducts = async (req, res, next) => {
  try {
    const products = await productService.search(req.query.q, req.query)
    res.json({ success: true, data: products })
  } catch (err) {
    next(err)
  }
}

export const getByCategory = async (req, res, next) => {
  try {
    const products = await productService.getByCategory(req.params.name, req.query)
    res.json({ success: true, data: products })
  } catch (err) {
    next(err)
  }
}

// ── POST /api/products/:id/images  (admin) ────────────────────────────────────
// productUpload.array('images', 6) middleware runs before this handler.
// Uploaded files are already on Cloudinary; req.files contains their URLs.
export const uploadProductImages = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(STATUS.BAD_REQUEST).json({ message: ERRORS.VALIDATION_FAILED })
    }

    // Check total image count before pushing
    const product = await productService.findProductByIdOrSlug(req.params.id)
    if (!product) {
      return res.status(STATUS.NOT_FOUND).json({ message: ERRORS.PRODUCT_NOT_FOUND })
    }

    const MAX_IMAGES = 10
    if (product.images.length + req.files.length > MAX_IMAGES) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: `A product can have at most ${MAX_IMAGES} images. Current: ${product.images.length}, uploading: ${req.files.length}`,
      })
    }

    const urls = req.files.map(f => f.path)   // multer-storage-cloudinary sets f.path = secure_url

    const updated = await Product.findByIdAndUpdate(
      product._id,
      { $push: { images: { $each: urls } } },
      { returnDocument: 'after', runValidators: true },
    )

    res.json({ success: true, data: updated })
  } catch (err) {
    next(err)
  }
}

// ── DELETE /api/products/:id/images  (admin) ──────────────────────────────────
// Body: { "url": "<cloudinary secure_url>" }
// Removes one image URL from the product's images array AND deletes from Cloudinary.
export const deleteProductImage = async (req, res, next) => {
  try {
    const { url } = req.body

    if (!url) {
      return res.status(STATUS.BAD_REQUEST).json({ message: ERRORS.VALIDATION_FAILED })
    }

    const product = await productService.findProductByIdOrSlug(req.params.id)
    if (!product) {
      return res.status(STATUS.NOT_FOUND).json({ message: ERRORS.PRODUCT_NOT_FOUND })
    }

    if (!product.images.includes(url)) {
      return res.status(STATUS.NOT_FOUND).json({ message: 'Image URL not found on this product' })
    }

    // Extract Cloudinary public_id from the URL.
    // URL pattern: https://res.cloudinary.com/<cloud>/image/upload/v<ver>/smartcart/products/<id>.<ext>
    // We need everything after /upload/v<digits>/ and before the file extension.
    const uploadIndex = url.indexOf('/upload/')
    const afterUpload = url.slice(uploadIndex + '/upload/'.length)        // v1234/smartcart/products/abc.jpg
    const withoutVersion = afterUpload.replace(/^v\d+\//, '')             // smartcart/products/abc.jpg
    const publicId = withoutVersion.replace(/\.[^/.]+$/, '')              // smartcart/products/abc

    await cloudinary.uploader.destroy(publicId)

    product.images = product.images.filter(img => img !== url)
    await product.save()

    res.json({ success: true, data: product })
  } catch (err) {
    next(err)
  }
}

// ── POST /api/products/:id/sync-vector  (admin) ───────────────────────────────
// Embeds a single product and upserts its vector into Pinecone.
// Register BEFORE the GET /:id route in productRoutes.js to avoid route shadowing.
export const syncVector = async (req, res, next) => {
  try {
    const product = await productService.findProductByIdOrSlug(req.params.id)
    if (!product) {
      return res.status(STATUS.NOT_FOUND).json({ success: false, message: ERRORS.PRODUCT_NOT_FOUND })
    }

    const result = await syncProductVector(product)

    // Mark vectorSynced = true in MongoDB
    await Product.findByIdAndUpdate(product._id, { $set: { vectorSynced: true } })

    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
}

export const syncAllVectors = async (req, res, next) => {
  try {
    const unsyncedProducts = await Product.find({ vectorSynced: false }).select('_id')
    const totalQueued      = unsyncedProducts.length
    const jobId            = randomUUID()

    currentSyncStatus.status = 'running'
    currentSyncStatus.error = null

    // Respond immediately — processing happens non-blocking in the background
    res.json({
      success: true,
      data: {
        jobId,
        totalQueued,
        message: 'Sync started in background',
      },
    })

    // ── Background processing via setImmediate (non-blocking) ─────────────
    setImmediate(async () => {
      let processed = 0
      let errors    = 0

      for (const stub of unsyncedProducts) {
        try {
          // Fetch full product document for embedding
          const product = await Product.findById(stub._id)
          if (!product) continue

          await syncProductVector(product)
          await Product.findByIdAndUpdate(stub._id, { $set: { vectorSynced: true } })

          processed++

          // Log progress every 10 products
          if (processed % 10 === 0) {
            console.info(`[syncAllVectors] jobId=${jobId} — products ${processed}/${totalQueued}`)
          }

          // 200ms delay between embeddings to avoid Gemini rate limits
          await new Promise(resolve => setTimeout(resolve, 200))
        } catch (e) {
          errors++
          console.error(`[syncAllVectors] jobId=${jobId} — failed for product ${stub._id}:`, e.message)
        }
      }

      console.info(
        `[syncAllVectors] jobId=${jobId} — products complete. ` +
        `processed: ${processed}, errors: ${errors}, total: ${totalQueued}`
      )

      // ── User behavior profiles → Pinecone user-profiles namespace ─────────
      let userStats = { totalQueued: 0, processed: 0, errors: 0, coldStart: 0 }
      try {
        userStats = await syncAllUserProfiles()
        console.info(
          `[syncAllVectors] jobId=${jobId} — user profiles complete. ` +
          `processed: ${userStats.processed}, errors: ${userStats.errors}, queued: ${userStats.totalQueued}`
        )
      } catch (e) {
        console.error(`[syncAllVectors] jobId=${jobId} — user profile sync failed:`, e.message)
        errors++
      }

      currentSyncStatus.status = (errors > 0 || userStats.errors > 0) ? 'failed' : 'completed'
      currentSyncStatus.lastSync = new Date()
      if (errors > 0 || userStats.errors > 0) {
        const parts = []
        if (errors > 0) parts.push(`${errors} product error(s)`)
        if (userStats.errors > 0) parts.push(`${userStats.errors} user profile error(s)`)
        currentSyncStatus.error = `Sync completed with ${parts.join(', ')}`
      } else {
        currentSyncStatus.error = null
      }

      console.info(`[syncAllVectors] jobId=${jobId} — all sync complete.`)
    })
  } catch (err) {
    next(err)
  }
}

export const getVectorSyncStatus = async (req, res, next) => {
  try {
    const totalProducts = await Product.countDocuments({ isActive: { $ne: false } })
    const syncedProducts = await Product.countDocuments({ isActive: { $ne: false }, vectorSynced: true })
    const pendingProducts = await Product.countDocuments({ isActive: { $ne: false }, vectorSynced: false })
    const userProfiles = await getUserProfileSyncStats()

    if (pendingProducts === 0 && userProfiles.pendingProfiles === 0 && currentSyncStatus.status === 'running') {
      currentSyncStatus.status = 'completed'
      currentSyncStatus.lastSync = new Date()
    }

    res.json({
      success: true,
      data: {
        ...currentSyncStatus,
        totalProducts,
        syncedProducts,
        pendingProducts,
        totalEligibleUsers: userProfiles.totalEligible,
        syncedUserProfiles: userProfiles.syncedProfiles,
        pendingUserProfiles: userProfiles.pendingProfiles,
      }
    })
  } catch (err) {
    next(err)
  }
}

