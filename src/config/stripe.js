import Stripe from 'stripe'
import { STRIPE_SECRET_KEY } from './env.js'

const stripeKey = STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY

let stripe

if (!stripeKey) {
  console.warn('Stripe secret key not configured. Stripe features will be disabled until STRIPE_SECRET_KEY is set.')
  stripe = {
    paymentIntents: {
      create: async () => { throw new Error('Stripe not configured. Set STRIPE_SECRET_KEY in your environment.') }
    },
    webhooks: {
      constructEvent: () => { throw new Error('Stripe webhook verification unavailable: STRIPE_SECRET_KEY not set.') }
    }
  }
} else {
  stripe = new Stripe(stripeKey)
}

export default stripe
