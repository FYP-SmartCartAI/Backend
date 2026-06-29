# SmartCart AI — Backend (Payments + Stripe)

This repository contains a simple Node.js + Express backend for SmartCart AI. It includes user/auth, products, orders, cart, reviews, and a Stripe payments integration (PaymentIntent + webhook). The README covers how to run locally and test Stripe webhooks using the Stripe CLI.

## Quick start

1. Install dependencies

```bash
npm install
```

2. Copy `.env.example` to `.env` and update values (important keys below)

3. Start the dev server

```bash
npm run dev
```

The server will run on `http://localhost:5000` by default.

## Required environment variables

Add these to your `.env` (or update `.env.example`):

- PORT=5000
- MONGO_URI=your_mongo_connection_string
- JWT_SECRET=your_jwt_secret
- STRIPE_SECRET_KEY=sk_test_xxx  # server secret key (starts with sk_test_...)
- STRIPE_PUBLISHABLE_KEY=pk_test_xxx
- STRIPE_WEBHOOK_SECRET=whsec_xxx

Notes:
- Use Stripe test keys for local development (sk_test_... and pk_test_...).
- STRIPE_WEBHOOK_SECRET is provided by the Stripe CLI when you run `stripe listen` or by the Stripe dashboard for a webhook endpoint.

## API endpoints (payments-related)

- POST /api/orders/checkout (auth) — create an Order and a PaymentIntent. Returns { orderId, clientSecret, paymentIntentId, amount }
- POST /api/payments/create-intent (auth) — create a PaymentIntent for an existing order
- POST /api/payments/webhook — Stripe webhook endpoint (raw body + signature verification)
- GET /api/payments/:orderId (auth) — get payment info for an order

## Testing Stripe webhooks locally (recommended: Stripe CLI)

Install Stripe CLI: https://stripe.com/docs/stripe-cli

1. Start your server

```bash
npm run dev
```

2. In a separate terminal, start the Stripe CLI listener and forward to your local webhook. This prints the `STRIPE_WEBHOOK_SECRET` to use in `.env`.

```bash
stripe listen --forward-to http://localhost:5000/api/payments/webhook
```

You should see output like:

```
> Ready! You are using Stripe API Version [2026-04-22.dahlia]. Your webhook signing secret is whsec_... (^C to quit)
```

Copy the printed `whsec_...` value into `.env` as `STRIPE_WEBHOOK_SECRET`.

3. Trigger a test event (PaymentIntent success) with the CLI

```bash
stripe trigger payment_intent.succeeded
```

The CLI will forward the generated events to your `/api/payments/webhook`. The server logs will show that the event was received and processed. You can inspect the `payments` collection in MongoDB to confirm records were created.

## Quick verification commands

- List recent payments (helper script):

```bash
node scripts/check_payments.js
```

- Create a test order and PaymentIntent (non-API quick helper):

```bash
node scripts/create_order_and_intent.js
```

This script creates a dummy order in the DB and creates a PaymentIntent using `STRIPE_SECRET_KEY`.

## Security notes

- Never commit `.env` or your Stripe secret key to source control. Use environment providers for production.
- Use `STRIPE_WEBHOOK_SECRET` to verify webhook signatures.
- Keep `sk_` keys on the server only; `pk_` keys are safe for client-side use.

## Next steps

- Add request validation and tests around the checkout flow.
- Add frontend demo using Stripe.js for complete end-to-end experience.
# SmartCart Backend

Backend for SmartCart AI (non-AI) — Node.js + Express + MongoDB + Stripe payments.

See `.env.example` for required environment variables. After creating the project run:

```bash
npm install
npm run dev
```

Stripe webhook testing:

```bash
# forward Stripe events to local webhook
stripe listen --forward-to localhost:5000/api/payments/webhook
```
