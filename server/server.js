const express = require('express')
const cors = require('cors')
const path = require('path')
const cookieParser = require('cookie-parser')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3001

// Import route modules
let authRoutes, bookingRoutes, locationRoutes, classRoutes, servicesRoutes

// Always use real database routes (MySQL/MariaDB)
{
  // Use real database routes
  authRoutes = require('./routes/auth')
  bookingRoutes = require('./routes/booking')
  locationRoutes = require('./routes/locations')
  classRoutes = require('./routes/classes')
  servicesRoutes = require('./routes/services')
  console.log('📊 Using real database routes')
  
  // Initialize database
  const db = require('./database/db')
  if (db.initDatabase) {
    db.initDatabase().then(() => {
      console.log('✅ Database initialized successfully')
    }).catch((error) => {
      console.error('❌ Database initialization failed:', error)
    })
  }
}

// Middleware
// Enforce critical envs in production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET) {
    console.error('Missing JWT_SECRET in production environment')
    process.exit(1)
  }
}

// Logging and request IDs
const { requestLogger } = require('./middleware/logging')
app.use(requestLogger)

const allowedOrigins = (process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : (process.env.NODE_ENV === 'production'
      ? ['https://serenitymassage.org', 'https://classes.serenitymassage.org']
      : ['http://localhost:3000', 'http://localhost:3002']))

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use(cookieParser())

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/booking', bookingRoutes)
app.use('/api/bookings', bookingRoutes)
app.use('/api/locations', locationRoutes)
app.use('/api/classes', classRoutes)
app.use('/api/services', servicesRoutes)

// Health check endpoint (with DB check)
app.get('/api/health', async (req, res) => {
  const db = require('./database/db')
  try {
    await db.query('SELECT 1 as ok')
    res.json({ 
      status: 'OK', 
      db: 'OK',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    })
  } catch (e) {
    console.error('Health DB error:', e && (e.code || e.message), e && e.message)
    res.status(500).json({ 
      status: 'DEGRADED', 
      db: 'ERROR', 
      message: e && e.message ? e.message : 'Database check failed', 
      code: e && e.code, 
      requestId: req.id 
    })
  }
})

// One-time admin init endpoint to force schema creation/seed
// Protect with ADMIN_INIT_KEY; if not set, require ADMIN_REGISTRATION_KEY
app.all('/api/admin/init', async (req, res) => {
  const key = req.query.key || req.body?.key
  const requiredKey = process.env.ADMIN_INIT_KEY || process.env.ADMIN_REGISTRATION_KEY
  if (requiredKey && key !== requiredKey) {
    return res.status(403).json({ message: 'Forbidden' })
  }
  try {
    const db = require('./database/db')
    if (typeof db.initDatabase === 'function') {
      await db.initDatabase()
    }
    res.json({ ok: true })
  } catch (e) {
    console.error('Admin init error:', e && e.message)
    res.status(500).json({ message: e && e.message, code: e && e.code })
  }
})

// Error handling middleware
app.use((err, req, res, next) => {
  const status = err.statusCode || 500
  const payload = { message: status === 500 ? 'Internal server error' : err.message, requestId: req.id }
  if (process.env.NODE_ENV !== 'production') payload.error = err.message
  console.error('Error:', { requestId: req.id, status, error: err.message })
  res.status(status).json(payload)
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'API endpoint not found' })
})

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Pure Serenity API Server running on port ${PORT}`)
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`🌐 CORS enabled for: ${process.env.NODE_ENV === 'production' 
    ? 'Production domains' 
    : 'http://localhost:3000, http://localhost:3002'
  }`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server')
  server.close(() => {
    console.log('HTTP server closed')
  })
})

module.exports = app
