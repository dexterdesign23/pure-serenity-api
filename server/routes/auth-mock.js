const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const router = express.Router()

// Mock user data for demo (in production this would be in a database)
const mockUsers = [
  {
    id: '1',
    email: 'admin@serenitymassage.org',
    password_hash: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LHAkCOYz6TtxMQJqhN', // admin123
    first_name: 'Admin',
    last_name: 'User',
    role: 'admin',
    created_at: new Date().toISOString()
  }
]

// Pre-hash the password for admin123
bcrypt.hash('admin123', 12).then(hash => {
  mockUsers[0].password_hash = hash
  console.log('✅ Mock admin user ready: admin@serenitymassage.org / admin123')
})

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    console.log('🔐 Mock login attempt:', req.body.email)
    const { email, password } = req.body
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' })
    }
    
    // Find user by email
    const user = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase())
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }
    
    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash)
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET || 'demo-secret-key',
      { expiresIn: '24h' }
    )
    
    // Don't send password hash in response
    const { password_hash, ...userWithoutPassword } = user
    
    console.log('✅ Mock login successful for:', email)
    res.json({
      message: 'Login successful',
      token,
      user: userWithoutPassword
    })
  } catch (error) {
    console.error('Mock login error:', error)
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
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'demo-secret-key')
    
    // Get fresh user data
    const user = mockUsers.find(u => u.id === decoded.userId)
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' })
    }
    
    const { password_hash, ...userWithoutPassword } = user
    
    res.json({
      valid: true,
      user: userWithoutPassword
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

module.exports = router
