// ─────────────────────────────────────────────────────────────────────────────
// HTTP Status Codes
// Reference: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
// ─────────────────────────────────────────────────────────────────────────────
export const STATUS = {
  // 2xx — Success
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,

  // 3xx — Redirection
  NOT_MODIFIED: 304,

  // 4xx — Client Errors
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  GONE: 410,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,

  // 5xx — Server Errors
  INTERNAL_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
}

// ─────────────────────────────────────────────────────────────────────────────
// Application Error Messages
// ─────────────────────────────────────────────────────────────────────────────
export const ERRORS = {
  // Auth
  MISSING_FIELDS: 'Missing required fields',
  INVALID_CREDENTIALS: 'Incorrect email or password',
  WRONG_CURRENT_PASSWORD: 'Current password is incorrect',
  EMAIL_TAKEN: 'Email already registered',
  INVALID_EMAIL: 'Please provide a valid email address',
  INVALID_EMAIL_ADDRESS: 'Please provide a valid, permanent email address.',
  EMAIL_VALIDATION_UNAVAILABLE: 'Email validation is temporarily unavailable. Please try again later.',
  PASSWORD_TOO_SHORT: 'Password must be at least 8 characters',
  PASSWORD_TOO_LONG: 'Password must be at most 25 characters',
  PASSWORD_WEAK: 'Password must contain at least one uppercase letter, lowercase letter, number, and special character',
  NOT_AUTHORIZED: 'Not authorized',
  ADMIN_ONLY: 'Admin access required',
  TOKEN_EXPIRED: 'Token has expired',
  TOKEN_INVALID: 'Invalid token',
  PASSWORD_CHANGED: 'Password was changed. Please log in again.',
  ACCOUNT_BLOCKED: 'Your account has been suspended. Please contact support.',
  USER_NOT_FOUND: 'User not found',

  // Products
  PRODUCT_NOT_FOUND: 'Product not found',
  OUT_OF_STOCK: (name, available) => `Only ${available} unit(s) left in stock for "${name}"`,

  // Orders
  NO_ITEMS: 'No items provided',
  ORDER_NOT_FOUND: 'Order not found',
  ORDER_ALREADY_CANCELLED: 'Order is already cancelled',
  ORDER_CANCEL_DENIED: 'Cannot cancel an order that has been shipped or delivered',
  ORDER_CANCEL_PAID: 'Cannot cancel a paid order. Please issue a refund first.',
  COD_ALREADY_COLLECTED: 'COD payment has already been collected for this order.',
  COD_ONLY_TRANSITION: "The 'cod_collected' status is only valid for Cash on Delivery orders.",

  // Support tickets
  TICKET_NOT_FOUND: 'Ticket not found',
  TICKET_ALREADY_CLOSED: 'Ticket is already closed',
  TICKET_CLOSED: 'Cannot send a message to a closed ticket',
  TICKET_MESSAGE_REQUIRED: 'Message text is required',
  TICKET_TOO_MANY_MESSAGES: 'This ticket has reached the maximum number of messages. Please open a new ticket.',
  TICKET_CITY_REQUIRED: 'Cannot create a ticket: no city found on the linked order or your profile. Please add an address to your profile.',
  INVALID_STATUS: (allowed) => `Invalid status. Allowed: ${allowed}`,
  STATUS_TRANSITION_DENIED: (from, to) => `Cannot change status from '${from}' to '${to}' with your role`,
  ORDER_CITY_MISMATCH: 'You can only update orders in your assigned city',
  SHIPPING_ADDRESS_REQUIRED: 'Shipping address with city is required',

  // Cart
  CART_NOT_FOUND: 'Cart not found',
  ITEM_NOT_IN_CART: 'Item not in cart',
  INVALID_QUANTITY: 'Quantity must be at least 1',

  // Reviews
  REVIEW_NOT_FOUND: 'Review not found',
  REVIEW_DUPLICATE: 'You have already reviewed this product',
  REVIEW_UNAUTHORIZED: 'You can only delete your own reviews',

  // Categories
  CATEGORY_NOT_FOUND: 'Category not found',
  SUBCATEGORY_NOT_FOUND: 'Subcategory not found',
  CATEGORY_SUBCATEGORY_NOT_FOUND: 'Category or subcategory not found',
  SUBCATEGORY_EXISTS: 'Subcategory already exists',
  CATEGORY_HAS_PRODUCTS: (count) => `Cannot delete: ${count} product(s) still reference this category. Reassign or delete them first.`,

  // Payments
  ORDER_ALREADY_PAID: 'Order is already paid',
  ORDER_ID_REQUIRED: 'orderId is required',
  NOT_ORDER_OWNER: 'You are not the owner of this order',

  // Sub-admin management
  SUBADMIN_CITY_REQUIRED: 'City is required when promoting to sub-admin',
  USER_NOT_SUBADMIN: 'This user is not a sub-admin',
  ALREADY_SUBADMIN: 'User is already a sub-admin for this city',
  CANNOT_DEMOTE_ADMIN: 'Cannot demote a main admin',

  // Idempotency
  IDEMPOTENCY_KEY_TOO_LONG: 'Idempotency-Key must be 128 characters or fewer',

  // Password reset
  EMAIL_SEND_FAILED: 'Failed to send reset email. Please try again later.',
  // Shown only when the token hash exists but the expiry timestamp has passed
  RESET_TOKEN_EXPIRED: 'Your reset link has expired. Please request a new one.',
  // Shown when the token hash is not found at all (wrong / tampered token)
  // Deliberately vague — do not hint that a valid-but-expired token exists
  RESET_TOKEN_INVALID: 'Invalid reset link. Please request a new password reset.',

  // Stripe webhook
  STRIPE_MISSING_SIGNATURE: 'Missing stripe signature',
  STRIPE_WEBHOOK_ERROR: (msg) => `Webhook Error: ${msg}`,

  // Success messages (used in JSON responses so they stay consistent)
  CATEGORY_DELETED: 'Category deleted',
  SUBCATEGORY_DELETED: 'Subcategory deleted',

  // General
  INTERNAL: 'Internal server error',
  TOO_MANY_REQUESTS: 'Too many requests, please try again later.',
  VALIDATION_FAILED: 'Validation failed',
  AT_LEAST_ONE_FIELD: 'Provide at least one field to update',
  ENDPOINT_NOT_FOUND: (method, path) => `Endpoint '${method} ${path}' does not exist`,
}
