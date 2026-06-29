import swaggerJsdoc from 'swagger-jsdoc'

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'SmartCart AI Backend API',
      version: '1.0.0',
      description: 'REST API for SmartCart: auth, products, cart, orders, reviews, payments (Stripe)',
    },
    servers: [{ url: `http://localhost:${process.env.PORT || 5000}` }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Register: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name:     { type: 'string', example: 'John Doe' },
            email:    { type: 'string', format: 'email', example: 'john@example.com' },
            password: { type: 'string', minLength: 6, example: 'secret123' },
          },
        },
        Login: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email:    { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
        ProfileUpdate: {
          type: 'object',
          properties: {
            name:     { type: 'string' },
            email:    { type: 'string' },
            password: { type: 'string' },
          },
        },
        Product: {
          type: 'object',
          required: ['name', 'price', 'category'],
          properties: {
            name:        { type: 'string', example: 'Wireless Mouse' },
            price:       { type: 'number', minimum: 0, example: 29.99 },
            category:    { type: 'string', example: 'Electronics' },
            description: { type: 'string' },
            stock:       { type: 'integer', minimum: 0, example: 100 },
            images:      { type: 'array', items: { type: 'string' } },
          },
        },
        CartAdd: {
          type: 'object',
          required: ['productId'],
          properties: {
            productId: { type: 'string', example: '664abc123def456' },
            quantity:  { type: 'integer', minimum: 1, default: 1, example: 2 },
          },
        },
        CartUpdate: {
          type: 'object',
          required: ['productId', 'quantity'],
          properties: {
            productId: { type: 'string' },
            quantity:  { type: 'integer', minimum: 0, description: 'Set to 0 to remove item' },
          },
        },
        Checkout: {
          type: 'object',
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['product', 'quantity', 'price'],
                properties: {
                  product:  { type: 'string', example: '664abc123def456' },
                  quantity: { type: 'integer', minimum: 1, example: 1 },
                  price:    { type: 'number',  minimum: 0, example: 29.99 },
                },
              },
            },
          },
        },
        ReviewCreate: {
          type: 'object',
          required: ['rating'],
          properties: {
            rating:  { type: 'integer', minimum: 1, maximum: 5, example: 4 },
            comment: { type: 'string', example: 'Great product!' },
          },
        },
      },
    },
  },
  // Pick up @swagger JSDoc annotations from every route file
  apis: ['./src/routes/*.js'],
}

export default swaggerJsdoc(options)
