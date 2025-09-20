const express = require('express')
const router = express.Router()
const { query } = require('../database/db')
const { validateBody, validateQuery, z } = require('../middleware/validate')
const { authenticateToken } = require('../middleware/auth')

// Get all locations
const listLocationsQuery = z.object({ active_only: z.enum(['true','false']).optional() })

router.get('/', validateQuery(listLocationsQuery), async (req, res) => {
  try {
    const { active_only } = req.query
    
    let queryText = 'SELECT * FROM locations'
    const clauses = []
    const params = []
    
    if (active_only === 'true') {
      clauses.push('is_active = 1')
    }
    
    if (clauses.length) {
      queryText += ' WHERE ' + clauses.join(' AND ')
    }
    
    queryText += ' ORDER BY name'
    
    const result = await query(queryText, params)
    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching locations:', error)
    res.status(500).json({ message: 'Failed to fetch locations' })
  }
})

// Get single location by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const result = await query('SELECT * FROM locations WHERE id = $1', [id])
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Location not found' })
    }
    
    res.json(result.rows[0])
  } catch (error) {
    console.error('Error fetching location:', error)
    res.status(500).json({ message: 'Failed to fetch location' })
  }
})

// Create new location (admin only)
const createLocationSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(2),
  zip_code: z.string().min(3),
  phone: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  operating_hours: z.any().optional(),
  is_active: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
})

router.post('/', authenticateToken, validateBody(createLocationSchema), async (req, res) => {
  try {
    const {
      name,
      address,
      city,
      state,
      zip_code,
      phone,
      latitude,
      longitude,
      operating_hours,
      is_active = true
    } = req.body
    
    if (!name || !address || !city || !state || !zip_code) {
      return res.status(400).json({ message: 'Name, address, city, state, and zip code are required' })
    }
    
    const result = await query(`
      INSERT INTO locations (
        name, address, city, state, zip_code, phone, 
        latitude, longitude, operating_hours, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      name, address, city, state, zip_code, phone,
      latitude, longitude, operating_hours, is_active
    ])
    
    res.status(201).json({
      message: 'Location created successfully',
      location: result.rows[0]
    })
  } catch (error) {
    console.error('Error creating location:', error)
    res.status(500).json({ message: 'Failed to create location' })
  }
})

// Update location (admin only)
const updateLocationSchema = createLocationSchema.partial()

router.put('/:id', authenticateToken, validateBody(updateLocationSchema), async (req, res) => {
  try {
    const { id } = req.params
    const {
      name,
      address,
      city,
      state,
      zip_code,
      phone,
      latitude,
      longitude,
      operating_hours,
      is_active
    } = req.body
    
    // Check if location exists
    const existingLocation = await query('SELECT id FROM locations WHERE id = $1', [id])
    if (existingLocation.rows.length === 0) {
      return res.status(404).json({ message: 'Location not found' })
    }
    
    const result = await query(`
      UPDATE locations SET
        name = COALESCE($1, name),
        address = COALESCE($2, address),
        city = COALESCE($3, city),
        state = COALESCE($4, state),
        zip_code = COALESCE($5, zip_code),
        phone = COALESCE($6, phone),
        latitude = COALESCE($7, latitude),
        longitude = COALESCE($8, longitude),
        operating_hours = COALESCE($9, operating_hours),
        is_active = COALESCE($10, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
      RETURNING *
    `, [
      name, address, city, state, zip_code, phone,
      latitude, longitude, operating_hours, is_active, id
    ])
    
    res.json({
      message: 'Location updated successfully',
      location: result.rows[0]
    })
  } catch (error) {
    console.error('Error updating location:', error)
    res.status(500).json({ message: 'Failed to update location' })
  }
})

// Delete location (admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    
    // Check if location has bookings (by foreign key)
    const bookingsCheck = await query(
      'SELECT COUNT(*) FROM bookings WHERE location_id = $1',
      [id]
    )
    
    const bookingCount = parseInt(bookingsCheck.rows[0].count)
    if (bookingCount > 0) {
      return res.status(409).json({ 
        message: 'Cannot delete location with existing bookings',
        booking_count: bookingCount
      })
    }
    
    const result = await query('DELETE FROM locations WHERE id = $1 RETURNING *', [id])
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Location not found' })
    }
    
    res.json({
      message: 'Location deleted successfully',
      deleted_location: result.rows[0]
    })
  } catch (error) {
    console.error('Error deleting location:', error)
    res.status(500).json({ message: 'Failed to delete location' })
  }
})

// Toggle location active status (admin only)
router.patch('/:id/toggle-active', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    
    const result = await query(`
      UPDATE locations 
      SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id])
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Location not found' })
    }
    
    res.json({
      message: `Location ${result.rows[0].is_active ? 'activated' : 'deactivated'} successfully`,
      location: result.rows[0]
    })
  } catch (error) {
    console.error('Error toggling location status:', error)
    res.status(500).json({ message: 'Failed to toggle location status' })
  }
})

module.exports = router
