// ── Load environment variables FIRST — before any other import reads process.env ──
import 'dotenv/config'

import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import helmet from 'helmet'
import hpp from 'hpp'
import compression from 'compression'
import morgan from 'morgan'
import session from 'express-session'
import passport from './src/config/passport.js'
import swaggerUi from 'swagger-ui-express'
import { fileURLToPath } from 'url'
import rateLimit from 'express-rate-limit'
import mongoSanitize from './src/middlewares/mongoSanitizeMiddleware.js'
import mongoose from 'mongoose'

import { PORT, NODE_ENV, SESSION_SECRET, CLIENT_URL } from './src/config/env.js'
import connectDB from './src/config/db.js'
import routes from './src/routes/index.js'
import oauthRoutes from './src/routes/oauthRoutes.js'
import errorMiddleware from './src/middlewares/errorMiddleware.js'
import swaggerSpec from './src/config/swagger.js'
import { initSocket } from './src/config/socket.js'
import { STATUS, ERRORS } from './src/constants/httpConstants.js'

// ── Abandoned cart cron job (self-scheduling, runs every hour) ────────────────
import './src/jobs/abandonedCartJob.js'
import './src/jobs/unresolvedTicketJob.js'

const app        = express()
const httpServer = createServer(app)   // raw HTTP server — needed for Socket.io

// ─── Security headers ─────────────────────────────────────────────────────────
// helmet sets 14 HTTP response headers: X-Frame-Options, X-Content-Type-Options,
// Strict-Transport-Security, Content-Security-Policy, etc.
app.use(helmet())

// ─── Swagger / OpenAPI ────────────────────────────────────────────────────────
app.get('/openapi.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.json(swaggerSpec)
})
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    explorer: true,
    swaggerOptions: { url: '/openapi.json' },
    customSiteTitle: 'SmartCart AI Backend API',
  }),
)

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() })
})

// ── STRIPE WEBHOOK — must be BEFORE express.json() ───────────────────────────
// Stripe requires the raw, unparsed request body to verify the webhook signature.
// express.raw() captures the raw body for this route only; all other routes get
// the normal JSON-parsed body from express.json() registered below.
app.use(
  '/api/payments/webhook',
  express.raw({ type: 'application/json' }),
)

// ── CORS ──────────────────────────────────────────────────────────────────────
const corsOptions = {
  origin: NODE_ENV === 'production'
    ? CLIENT_URL
    : true,
  credentials: true,
}
app.use(cors(corsOptions))

// ── Compression ───────────────────────────────────────────────────────────────
// Gzip/Brotli compress all responses — skip for the webhook route (raw body)
app.use(compression())

// ── HTTP request logging ──────────────────────────────────────────────────────
// Custom dev format with local timestamp: [HH:MM:SS] METHOD /path STATUS response-time ms
if (NODE_ENV !== 'test') {
  morgan.token('time', () => new Date().toLocaleTimeString())
  app.use(morgan('[:time] :method :url :status :response-time ms - :res[content-length]'))
}

// ── Security: strip MongoDB operators ($gt, $where …) from req.body/query ────
// Skip for Stripe webhook — mongoSanitize converts the raw Buffer body to a plain
// object (Buffer IS typeof 'object'), destroying it before signature verification.
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') return next()
  mongoSanitize(req, res, next)
})

// ── HTTP Parameter Pollution protection ──────────────────────────────────────
// Skip for webhook for the same reason — hpp may also read/mutate req.body.
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') return next()
  hpp({ whitelist: ['ids', 'categories', 'tags'] })(req, res, next)
})

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Disabled in development so repeated test logins / API calls are never blocked.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})
if (NODE_ENV !== 'development') {
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { success: false, message: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use('/api/auth', authLimiter)
  app.use('/api', generalLimiter)
}

// ── Session ───────────────────────────────────────────────────────────────────
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: NODE_ENV === 'production', httpOnly: true, maxAge: 10 * 60 * 1000 },
}))

// ── Passport ──────────────────────────────────────────────────────────────────
app.use(passport.initialize())
app.use(passport.session())

// ── JSON + URL-encoded body parsers ──────────────────────────────────────────
// Skip JSON parsing for the Stripe webhook — it needs the raw body for signature
// verification. express.json() would replace the Buffer and cause 400 errors.
const jsonParser = express.json({ limit: '10kb' })
const urlParser  = express.urlencoded({ extended: true, limit: '10kb' })
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') return next()
  jsonParser(req, res, next)
})
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') return next()
  urlParser(req, res, next)
})

// ── OAuth Routes (root-level `/auth` to match Google/Facebook registered redirect URIs) ──
app.use('/auth', authLimiter)
app.use('/auth', oauthRoutes)

// ── All API routes ────────────────────────────────────────────────────────────
app.use('/api', routes)

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(STATUS.NOT_FOUND).json({
    success: false,
    message: ERRORS.ENDPOINT_NOT_FOUND(req.method, req.originalUrl),
  })
})

// ── Global error handler — MUST be last middleware ────────────────────────────
app.use(errorMiddleware)

// ── Start server ──────────────────────────────────────────────────────────────
// Only when run directly or via PM2 (not imported by tests)
const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url) || 
                    (process.argv[1] && process.argv[1].endsWith('server.js')) || 
                    process.env.PM2_HOME !== undefined;

if (isDirectRun) {
  const port = PORT || 5000

  // ── Await DB connection before accepting traffic ───────────────────────────
  // This prevents requests arriving before Mongoose is ready, which would cause
  // cascading errors on every DB query during the connection window.
  try {
    await connectDB()
  } catch (e) {
    console.error('[startup] MongoDB connection failed:', e.message)
    process.exit(1)
  }

  // ── Attach Socket.io to the HTTP server before listening ──────────────────
  initSocket(httpServer)

  httpServer.listen(port, () => {
    console.log(`[server] Running on port ${port} (${NODE_ENV})`)
    console.log(`[server] API Docs → http://localhost:${port}/api-docs`)
  })

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal) => {
    console.info(`[shutdown] ${signal} received — shutting down gracefully…`)
    httpServer.close(async () => {
      try {
        await mongoose.connection.close()
        console.info('[shutdown] MongoDB connection closed ✅')
      } catch (e) {
        console.error('[shutdown] Error closing MongoDB:', e.message)
      }
      process.exit(0)
    })
    setTimeout(() => {
      console.error('[shutdown] Forced exit after 10s timeout')
      process.exit(1)
    }, 10_000).unref()
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

export default app // reload
