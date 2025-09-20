const jwt = require('jsonwebtoken')

function readToken(req) {
  const header = req.headers['authorization']
  if (header && header.startsWith('Bearer ')) return header.split(' ')[1]
  // Optional: read from cookie when added
  if (req.cookies && req.cookies.token) return req.cookies.token
  return null
}

// Middleware to authenticate JWT tokens
const authenticateToken = (req, res, next) => {
  const token = readToken(req)

  if (!token) {
    return res.status(401).json({ message: 'Access token required' })
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired' })
      }
      return res.status(403).json({ message: 'Invalid token' })
    }
    
    req.user = user
    next()
  })
}

// Middleware to check if user has admin role
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' })
  }
  next()
}

// Optional authentication - sets user if token is valid, but doesn't require it
const optionalAuth = (req, res, next) => {
  const token = readToken(req)

  if (!token) {
    req.user = null
    return next()
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      req.user = null
    } else {
      req.user = user
    }
    next()
  })
}

module.exports = {
  authenticateToken,
  requireAdmin,
  optionalAuth
}
