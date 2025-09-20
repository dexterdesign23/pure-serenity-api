const express = require('express')
const router = express.Router()
const { query } = require('../database/db')
const { validateBody, validateQuery, z } = require('../middleware/validate')
const { authenticateToken } = require('../middleware/auth')

// Get all services
const listServicesQuery = z.object({
  category: z.string().optional(),
  active_only: z.enum(['true','false']).optional(),
})

router.get('/', validateQuery(listServicesQuery), async (req, res) => {
  try {
    const { category, active_only } = req.query
    
    let queryText = 'SELECT * FROM services WHERE 1=1'
    const params = []
    let paramCount = 0
    
    if (category) {
      queryText += ` AND category = $${++paramCount}`
      params.push(category)
    }
    
    if (active_only === 'true') {
      queryText += ` AND is_active = $${++paramCount}`
      params.push(1)
    }
    
    queryText += ' ORDER BY category, name'
    
    const result = await query(queryText, params)
    
    res.json({ services: result.rows })
  } catch (error) {
    console.error('Error fetching services:', error)
    res.status(500).json({ message: 'Failed to fetch services' })
  }
})

// Get single service
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    
    const result = await query('SELECT * FROM services WHERE id = $1', [id])
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Service not found' })
    }
    
    res.json({
      service: result.rows[0]
    })
  } catch (error) {
    console.error('Error fetching service:', error)
    res.status(500).json({ message: 'Failed to fetch service' })
  }
})

// Create new service (admin only)
const createServiceSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  duration: z.number().int().min(15).max(300),
  price: z.number().nonnegative(),
  category: z.string().min(1),
})

router.post('/', authenticateToken, validateBody(createServiceSchema), async (req, res) => {
  try {
    const { name, description, duration, price, category } = req.body
    
    if (!name || !description || !duration || !price || !category) {
      return res.status(400).json({ message: 'All fields are required' })
    }
    
    if (duration < 15 || duration > 300) {
      return res.status(400).json({ message: 'Duration must be between 15 and 300 minutes' })
    }
    
    if (price < 0) {
      return res.status(400).json({ message: 'Price must be positive' })
    }
    
    const result = await query(`
      INSERT INTO services (name, description, duration, price, category, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, description, duration, price, category, true])
    
    res.status(201).json({
      message: 'Service created successfully',
      service: result.rows[0]
    })
  } catch (error) {
    console.error('Error creating service:', error)
    
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
      return res.status(409).json({ message: 'A service with this name already exists' })
    }
    
    res.status(500).json({ message: 'Failed to create service' })
  }
})

// Update service (admin only)
const updateServiceSchema = createServiceSchema.partial().extend({ is_active: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional() })

router.put('/:id', authenticateToken, validateBody(updateServiceSchema), async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, duration, price, category, is_active } = req.body
    
    // Check if service exists
    const existingService = await query('SELECT id FROM services WHERE id = $1', [id])
    if (existingService.rows.length === 0) {
      return res.status(404).json({ message: 'Service not found' })
    }
    
    // Build update query dynamically
    const updates = []
    const params = []
    let paramCount = 0
    
    if (name !== undefined) {
      updates.push(`name = $${++paramCount}`)
      params.push(name)
    }
    
    if (description !== undefined) {
      updates.push(`description = $${++paramCount}`)
      params.push(description)
    }
    
    if (duration !== undefined) {
      if (duration < 15 || duration > 300) {
        return res.status(400).json({ message: 'Duration must be between 15 and 300 minutes' })
      }
      updates.push(`duration = $${++paramCount}`)
      params.push(duration)
    }
    
    if (price !== undefined) {
      if (price < 0) {
        return res.status(400).json({ message: 'Price must be positive' })
      }
      updates.push(`price = $${++paramCount}`)
      params.push(price)
    }
    
    if (category !== undefined) {
      updates.push(`category = $${++paramCount}`)
      params.push(category)
    }
    
    if (is_active !== undefined) {
      updates.push(`is_active = $${++paramCount}`)
      params.push(is_active)
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' })
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`)
    params.push(id)
    
    const updateQuery = `
      UPDATE services 
      SET ${updates.join(', ')} 
      WHERE id = $${++paramCount}
      RETURNING *
    `
    
    const result = await query(updateQuery, params)
    
    res.json({
      message: 'Service updated successfully',
      service: result.rows[0]
    })
  } catch (error) {
    console.error('Error updating service:', error)
    
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
      return res.status(409).json({ message: 'A service with this name already exists' })
    }
    
    res.status(500).json({ message: 'Failed to update service' })
  }
})

// Delete service (admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    
    // Check if service is referenced in any bookings
    const bookingCheck = await query('SELECT COUNT(*) as count FROM bookings WHERE service_id = $1', [id])
    if (parseInt(bookingCheck.rows[0].count) > 0) {
      return res.status(409).json({ 
        message: 'Cannot delete service that has associated bookings. Deactivate it instead.' 
      })
    }
    
    const result = await query('DELETE FROM services WHERE id = $1 RETURNING id', [id])
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Service not found' })
    }
    
    res.json({
      message: 'Service deleted successfully',
      deleted: result.rows[0]
    })
  } catch (error) {
    console.error('Error deleting service:', error)
    res.status(500).json({ message: 'Failed to delete service' })
  }
})

// Get service categories
router.get('/meta/categories', async (req, res) => {
  try {
    const result = await query(`
      SELECT DISTINCT category, COUNT(*) as count 
      FROM services 
      WHERE is_active = true 
      GROUP BY category 
      ORDER BY category
    `)
    
    res.json({
      categories: result.rows
    })
  } catch (error) {
    console.error('Error fetching service categories:', error)
    res.status(500).json({ message: 'Failed to fetch service categories' })
  }
})

module.exports = router
