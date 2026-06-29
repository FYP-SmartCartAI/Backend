import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as FacebookStrategy } from 'passport-facebook'
import User from '../models/User.js'
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, PORT } from './env.js'

// ─── Helper: find-or-create for any OAuth provider ───────────────────────────
async function findOrCreate({ providerId, providerField, email, name, avatar, provider }) {
  // 1. Already registered via this provider
  let user = await User.findOne({ [providerField]: providerId })
  if (user) return user

  // 2. Email already registered locally — link the provider account
  if (email) {
    user = await User.findOne({ email })
    if (user) {
      user[providerField] = providerId
      user.avatar   = user.avatar || avatar
      user.provider = provider
      await user.save()
      return user
    }
  }

  // ── Edge case: Facebook may not return an email (phone-only accounts,
  //    restricted permissions). Use a placeholder so User.create doesn't fail.
  const resolvedEmail = email || `${provider}_${providerId}@oauth.placeholder`

  // 3. Brand-new user — no password required for OAuth accounts
  return await User.create({
    name:            name || `${provider} User`,
    email:           resolvedEmail,
    [providerField]: providerId,
    avatar,
    provider,
  })
}

// ─── Google OAuth 2.0 ────────────────────────────────────────────────────────
passport.use(
  new GoogleStrategy(
    {
      clientID:     GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL:  `http://localhost:${PORT}/auth/google/callback`,
      scope: ['profile', 'email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await findOrCreate({
          providerId:    profile.id,
          providerField: 'googleId',
          email:         profile.emails?.[0]?.value,
          name:          profile.displayName,
          avatar:        profile.photos?.[0]?.value,
          provider:      'google',
        })
        done(null, user)
      } catch (err) {
        done(err, null)
      }
    }
  )
)

// ─── Facebook OAuth 2.0 ──────────────────────────────────────────────────────
passport.use(
  new FacebookStrategy(
    {
      clientID:      FACEBOOK_APP_ID,
      clientSecret:  FACEBOOK_APP_SECRET,
      callbackURL:   `http://localhost:${PORT}/auth/facebook/callback`,
      profileFields: ['id', 'displayName', 'emails', 'photos'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await findOrCreate({
          providerId:    profile.id,
          providerField: 'facebookId',
          email:         profile.emails?.[0]?.value,
          name:          profile.displayName,
          avatar:        profile.photos?.[0]?.value,
          provider:      'facebook',
        })
        done(null, user)
      } catch (err) {
        done(err, null)
      }
    }
  )
)

// ─── Session serialization (used only during the OAuth redirect dance) ────────
passport.serializeUser((user, done) => done(null, user._id.toString()))
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).select('-password')
    done(null, user)
  } catch (err) {
    done(err, null)
  }
})

export default passport
