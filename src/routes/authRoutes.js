import express from 'express'
const router = express.Router()
import * as authController from '../controllers/authController.js'
import { protect } from '../middlewares/authMiddleware.js'
import { validate } from '../middlewares/validateMiddleware.js'
import { registerSchema, loginSchema, updateProfileSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema, fcmTokenSchema } from '../utils/validators.js'
import { avatarUpload, multerErrorHandler } from '../middlewares/uploadMiddleware.js'

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: User registration, login and profile
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Register'
 *     responses:
 *       201:
 *         description: JWT token + user object
 *       400:
 *         description: Missing fields or email already registered
 */
router.post('/register', validate(registerSchema), authController.register)

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Login'
 *     responses:
 *       200:
 *         description: JWT token + user object
 *       400:
 *         description: Invalid credentials
 */
router.post('/login', validate(loginSchema), authController.login)

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     tags: [Auth]
 *     summary: Get logged-in user profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile object
 *       401:
 *         description: Not authorized
 *   put:
 *     tags: [Auth]
 *     summary: Update user profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProfileUpdate'
 *     responses:
 *       200:
 *         description: Updated user object
 */
router.get('/profile', protect, authController.profile)
router.put('/profile', protect, validate(updateProfileSchema), authController.updateProfile)

// ── POST /api/auth/avatar  ─────────────────────────────────────────────────────
// Accepts multipart/form-data with field name "avatar" (single image, max 2 MB).
// Returns { success: true, data: { avatar: "<cloudinary_url>" } }
router.post(
  '/avatar',
  protect,
  avatarUpload.single('avatar'),
  multerErrorHandler,
  authController.uploadAvatar,
)

// ── Password reset (public — no JWT required) ─────────────────────────────────

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset email
 *     description: >
 *       Always returns 200 regardless of whether the email exists — prevents
 *       user enumeration. Check the inbox for a reset link (valid 10 min).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Reset link sent (or silently ignored if email not found)
 */
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword)

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Set a new password using the emailed token
 *     description: >
 *       Token is the raw value from the reset link query string (?token=...).
 *       Valid for 10 minutes. Invalidates all existing sessions on success.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token:    { type: string }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password changed + fresh JWT returned
 *       400:
 *         description: Token invalid or expired
 */
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword)

router.post('/change-password', protect, validate(changePasswordSchema), authController.changePassword)

/**
 * @swagger
 * /api/auth/fcm-token:
 *   post:
 *     tags: [Auth]
 *     summary: Register or clear a Firebase Cloud Messaging device token
 *     description: >
 *       Call after login (or when the FCM token refreshes) to enable push notifications.
 *       Pass `fcmToken: null` to deregister (e.g. on logout or when user opts out).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fcmToken: { type: string, nullable: true, description: 'Pass null to deregister' }
 *     responses:
 *       200:
 *         description: Token saved
 *       401:
 *         description: Not authorized
 */
router.post('/fcm-token', protect, validate(fcmTokenSchema), authController.registerFcmToken)

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout — clear FCM token and deregister device
 *     description: >
 *       Clears the user's FCM token in the database so no further push notifications
 *       are sent to this device. JWT is stateless — the client must delete the token
 *       from localStorage or cookies. Call this on every logout.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { nullable: true, example: null }
 *                 message: { type: string, example: "Logged out successfully" }
 *       401:
 *         description: Not authorized
 */
router.post('/logout', protect, authController.logout)

export default router

