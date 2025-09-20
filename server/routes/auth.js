const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const router = express.Router()
const rateLimitWindowMs = 15 * 60 * 1000
const maxAttempts = 10
const lockoutThreshold = 5
const lockoutMs = 15 * 60 * 1000
const attempts = new Map() // key: ip or email

function getKey(req, email) {
  return email ? `email:${email.toLowerCase()}` : `ip:${req.ip}`
}

function recordFailure(key) {
  const now = Date.now()
  const entry = attempts.get(key) || { count: 0, first: now, lockUntil: 0 }
  if (now - entry.first > rateLimitWindowMs) {
    entry.count = 0
    entry.first = now
  }
  entry.count += 1
  if (entry.count >= lockoutThreshold) {
    entry.lockUntil = now + lockoutMs
  }
  attempts.set(key, entry)
}

function resetAttempts(key) {
  attempts.delete(key)
}

function isLocked(key) {
  const entry = attempts.get(key)
  if (!entry) return false
  if (entry.lockUntil && Date.now() < entry.lockUntil) return true
  return false
}
const { query } = require('../database/db')
const { validateBody, z } = require('../middleware/validate')

// Login endpoint
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(100),
})

router.post('/login', validateBody(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body
    
    // Rate limit and lockout checks
    const key = getKey(req, email)
    const ipKey = getKey(req)
    if (isLocked(key) || isLocked(ipKey)) {
      return res.status(429).json({ message: 'Too many failed attempts. Try again later.' })
    }

    // fields validated above
    
    // Find user by email
    const result = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()])
    
    if (result.rows.length === 0) {
      recordFailure(key); recordFailure(ipKey)
      return res.status(401).json({ message: 'Invalid credentials' })
    }
    
    const user = result.rows[0]
    
    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash)
    if (!validPassword) {
      recordFailure(key); recordFailure(ipKey)
      return res.status(401).json({ message: 'Invalid credentials' })
    }
    
    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production';
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      },
      jwtSecret,
      { expiresIn: '24h' }
    )
    
    // Don't send password hash in response
    const { password_hash, ...userWithoutPassword } = user
    
    resetAttempts(key); resetAttempts(ipKey)
    res.json({
      message: 'Login successful',
      token,
      user: userWithoutPassword
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// Register endpoint (for creating admin users)
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  adminKey: z.string().min(10),
})

router.post('/register', validateBody(registerSchema), async (req, res) => {
  try {
    const { email, password, firstName, lastName, adminKey } = req.body
    
    // Verify admin registration key
    if (adminKey !== process.env.ADMIN_REGISTRATION_KEY) {
      return res.status(403).json({ message: 'Invalid admin registration key' })
    }
    
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ message: 'All fields are required' })
    }
    
    // Check if user already exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()])
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'User already exists' })
    }
    
    // Hash password
    const saltRounds = 12
    const password_hash = await bcrypt.hash(password, saltRounds)
    
    // Create user
    const result = await query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, first_name, last_name, role, created_at
    `, [email.toLowerCase(), password_hash, firstName, lastName, 'admin'])
    
    const newUser = result.rows[0]
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: newUser.id, 
        email: newUser.email, 
        role: newUser.role 
      },
      process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production',
      { expiresIn: '24h' }
    )
    
    res.status(201).json({
      message: 'Admin user created successfully',
      token,
      user: newUser
    })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// Verify token endpoint
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' })
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production')
    
    // Get fresh user data
    const result = await query(
      'SELECT id, email, first_name, last_name, role, created_at FROM users WHERE id = $1',
      [decoded.userId]
    )
    
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'User not found' })
    }
    
    res.json({
      valid: true,
      user: result.rows[0]
    })
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' })
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' })
    }
    
    console.error('Token verification error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' })
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production')
    
    // Generate new token
    const newToken = jwt.sign(
      { 
        userId: decoded.userId, 
        email: decoded.email, 
        role: decoded.role 
      },
      process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production',
      { expiresIn: '24h' }
    )
    
    res.json({
      message: 'Token refreshed successfully',
      token: newToken
    })
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Invalid or expired token' })
    }
    
    console.error('Token refresh error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// Change password endpoint
const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(8),
})

router.post('/change-password', validateBody(changePasswordSchema), async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    const { currentPassword, newPassword } = req.body
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' })
    }
    
    // validated above
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production')
    
    // Get user with current password hash
    const result = await query('SELECT password_hash FROM users WHERE id = $1', [decoded.userId])
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' })
    }
    
    const user = result.rows[0]
    
    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash)
    if (!validPassword) {
      return res.status(401).json({ message: 'Current password is incorrect' })
    }
    
    // Hash new password
    const saltRounds = 12
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds)
    
    // Update password
    await query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, decoded.userId]
    )
    
    res.json({ message: 'Password changed successfully' })
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Invalid or expired token' })
    }
    
    console.error('Change password error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

module.exports = router
