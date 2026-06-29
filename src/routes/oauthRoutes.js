import express from 'express'
const router = express.Router()
import passport from '../config/passport.js'
import { CLIENT_URL } from '../config/env.js'
import { protect } from '../middlewares/authMiddleware.js'
import * as oauthController from '../controllers/oauthController.js'

/**
 * @swagger
 * tags:
 *   name: OAuth
 *   description: Google and Facebook OAuth 2.0 — social login
 */

/**
 * @swagger
 * /api/oauth/google:
 *   get:
 *     tags: [OAuth]
 *     summary: Initiate Google OAuth 2.0 login
 *     description: |
 *       Redirects the browser to Google's consent screen.
 *       After the user grants permission Google redirects back to
 *       `/api/oauth/google/callback` where a JWT is issued and the
 *       browser is forwarded to the frontend with the token in the
 *       query string: `{CLIENT_URL}/oauth/callback?token=<jwt>`
 *     responses:
 *       302:
 *         description: Redirect to Google
 */
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false }),
)

/**
 * @swagger
 * /api/oauth/google/callback:
 *   get:
 *     tags: [OAuth]
 *     summary: Google OAuth 2.0 callback (handled internally)
 *     description: |
 *       Google redirects here after the user approves/denies access.
 *       On success the browser is redirected to:
 *       `{CLIENT_URL}/oauth/callback?token=<jwt>`
 *       On failure it redirects to:
 *       `{CLIENT_URL}/login?error=oauth_failed`
 *     parameters:
 *       - in: query
 *         name: code
 *         schema: { type: string }
 *         description: Authorization code provided by Google (handled automatically)
 *     responses:
 *       302:
 *         description: Redirect to frontend with JWT token
 */
router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${CLIENT_URL}/login?error=oauth_failed`,
  }),
  oauthController.googleCallback,
)

/**
 * @swagger
 * /api/oauth/facebook:
 *   get:
 *     tags: [OAuth]
 *     summary: Initiate Facebook OAuth 2.0 login
 *     description: |
 *       Redirects the browser to Facebook's login / consent dialog.
 *       After approval Facebook redirects back to `/api/oauth/facebook/callback`
 *       where a JWT is issued and the browser is forwarded to:
 *       `{CLIENT_URL}/oauth/callback?token=<jwt>`
 *     responses:
 *       302:
 *         description: Redirect to Facebook
 */
router.get(
  '/facebook',
  passport.authenticate('facebook', { session: false }),
)

/**
 * @swagger
 * /api/oauth/facebook/callback:
 *   get:
 *     tags: [OAuth]
 *     summary: Facebook OAuth 2.0 callback (handled internally)
 *     description: |
 *       Facebook redirects here after the user approves/denies access.
 *       On success the browser is redirected to:
 *       `{CLIENT_URL}/oauth/callback?token=<jwt>`
 *       On failure it redirects to:
 *       `{CLIENT_URL}/login?error=oauth_failed`
 *     parameters:
 *       - in: query
 *         name: code
 *         schema: { type: string }
 *         description: Authorization code provided by Facebook (handled automatically)
 *     responses:
 *       302:
 *         description: Redirect to frontend with JWT token
 */
router.get(
  '/facebook/callback',
  passport.authenticate('facebook', {
    session: false,
    failureRedirect: `${CLIENT_URL}/login?error=oauth_failed`,
  }),
  oauthController.facebookCallback,
)

/**
 * @swagger
 * /api/oauth/me:
 *   get:
 *     tags: [OAuth]
 *     summary: Get current OAuth / JWT authenticated user
 *     description: Works for both local JWT and OAuth JWT tokens.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Authenticated user object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:       { type: string }
 *                         name:     { type: string }
 *                         email:    { type: string }
 *                         avatar:   { type: string }
 *                         provider: { type: string, enum: [local, google, facebook] }
 *                         role:     { type: string, enum: [user, subadmin, admin] }
 *       401:
 *         description: Not authorized
 */
router.get('/me', protect, oauthController.getMe)

/**
 * @swagger
 * /api/oauth/logout:
 *   post:
 *     tags: [OAuth]
 *     summary: OAuth logout — signals client to discard token
 *     description: |
 *       JWT is stateless — this endpoint returns success as a hint for the
 *       frontend to delete its stored token. The Passport session is also
 *       destroyed if one exists.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *       401:
 *         description: Not authorized
 */
router.post('/logout', protect, oauthController.logout)

export default router
