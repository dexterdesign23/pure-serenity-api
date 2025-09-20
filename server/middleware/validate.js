const { z } = require('zod')

function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body)
      next()
    } catch (e) {
      return res.status(400).json({ message: 'Validation error', errors: e.errors })
    }
  }
}

function validateQuery(schema) {
  return (req, res, next) => {
    try {
      req.query = schema.parse(req.query)
      next()
    } catch (e) {
      return res.status(400).json({ message: 'Validation error', errors: e.errors })
    }
  }
}

module.exports = { validateBody, validateQuery, z }


