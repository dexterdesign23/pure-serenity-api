const express = require('express')
const router = express.Router()
const { query } = require('../database/db')
const { validateBody, validateQuery, z } = require('../middleware/validate')
const { authenticateToken } = require('../middleware/auth')

// Get all bookings (admin only)
// Admin bookings route (alias for main route)
const listBookingsQuery = z.object({
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  status: z.enum(['pending','confirmed','completed','cancelled']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

router.get('/admin', authenticateToken, validateQuery(listBookingsQuery), async (req, res) => {
  try {
    const pageNum = parseInt(req.query.page || '1', 10)
    const limitNum = Math.min(parseInt(req.query.limit || '20', 10), 100)
    const { status, date } = req.query
    const offset = (pageNum - 1) * limitNum
    
    let queryText = `
      SELECT 
        b.id,
        s.name as service_type,
        b.duration,
        b.appointment_date as scheduled_date,
        b.appointment_time as scheduled_time,
        b.appointment_date as appointment_date,
        b.appointment_time as appointment_time,
        l.name as location,
        b.client_first_name,
        b.client_last_name,
        b.client_email,
        b.client_phone,
        b.price as total_amount,
        b.status,
        b.notes as special_notes,
        b.created_at,
        b.updated_at
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN locations l ON b.location_id = l.id
      WHERE 1=1
    `
    
    const params = []
    let paramCount = 0
    
    if (status) {
      queryText += ` AND b.status = $${++paramCount}`
      params.push(status)
    }
    
    if (date) {
      queryText += ` AND b.appointment_date = $${++paramCount}`
      params.push(date)
    }
    
    // MySQL can be finicky with placeholders in LIMIT/OFFSET; inline safe integers
    queryText += ` ORDER BY b.created_at DESC LIMIT ${limitNum} OFFSET ${offset}`
    
    const result = await query(queryText, params)
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) AS count FROM bookings WHERE 1=1'
    const countParams = []
    let countParamCount = 0
    
    if (status) {
      countQuery += ` AND status = $${++countParamCount}`
      countParams.push(status)
    }
    
    if (date) {
      countQuery += ` AND appointment_date = $${++countParamCount}`
      countParams.push(date)
    }
    
    const countResult = await query(countQuery, countParams)
    const total = parseInt(countResult.rows[0].count || countResult.rows[0].COUNT || 0)
    
    res.json({
      bookings: result.rows,
      pagination: {
      page: pageNum,
      limit: limitNum,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching admin bookings:', error)
    res.status(500).json({ message: 'Failed to fetch bookings' })
  }
})

router.get('/', authenticateToken, validateQuery(listBookingsQuery), async (req, res) => {
  try {
    const { page = 1, limit = 20, status, date } = req.query
    const offset = (page - 1) * limit
    
    let queryText = `
      SELECT 
        b.id, s.name as service_type, b.duration, 
        b.appointment_date as scheduled_date, b.appointment_time as scheduled_time,
        b.appointment_date as appointment_date, b.appointment_time as appointment_time,
        l.name as location, b.client_first_name, b.client_last_name, b.client_email,
        b.client_phone, 'online' as payment_method, 'pending' as payment_status, 
        b.price as total_amount, b.status, b.created_at
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN locations l ON b.location_id = l.id
      WHERE 1=1
    `
    const params = []
    let paramCount = 0
    
    if (status) {
      paramCount++
      queryText += ` AND b.status = $${paramCount}`
      params.push(status)
    }
    
    if (date) {
      paramCount++
      queryText += ` AND b.appointment_date = $${paramCount}`
      params.push(date)
    }
    
    queryText += ` ORDER BY b.appointment_date DESC, b.appointment_time DESC`
    
    // Inline LIMIT/OFFSET to avoid MySQL prepared statement quirks
    queryText += ` LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}`
    
    const result = await query(queryText, params)
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) AS count FROM bookings WHERE 1=1'
    const countParams = []
    let countParamCount = 0
    
    if (status) {
      countParamCount++
      countQuery += ` AND status = $${countParamCount}`
      countParams.push(status)
    }
    
    if (date) {
      countParamCount++
      countQuery += ` AND appointment_date = $${countParamCount}`
      countParams.push(date)
    }
    
    const countResult = await query(countQuery, countParams)
    const total = parseInt(countResult.rows[0].count || countResult.rows[0].COUNT || 0)
    
    res.json({
      bookings: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching bookings:', error)
    res.status(500).json({ message: 'Failed to fetch bookings' })
  }
})

// Get single booking by ID (admin only)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const result = await query('SELECT * FROM bookings WHERE id = $1', [id])
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found' })
    }
    
    res.json(result.rows[0])
  } catch (error) {
    console.error('Error fetching booking:', error)
    res.status(500).json({ message: 'Failed to fetch booking' })
  }
})

// Create new booking (public)
const createBookingSchema = z.object({
  service_id: z.number().int().positive(),
  duration: z.number().int().min(15).max(300),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  appointment_time: z.string().regex(/^\d{2}:\d{2}$/),
  location_id: z.number().int().positive(),
  client_first_name: z.string().min(1),
  client_last_name: z.string().min(1),
  client_email: z.string().email(),
  client_phone: z.string().min(7),
  notes: z.string().max(2000).optional(),
  price: z.number().nonnegative(),
})

router.post('/', validateBody(createBookingSchema), async (req, res) => {
  try {
    const {
      service_id,
      duration,
      appointment_date,
      appointment_time,
      location_id,
      client_first_name,
      client_last_name,
      client_email,
      client_phone,
      notes = '',
      price
    } = req.body
    
    // Validate required fields
    if (!service_id || !duration || !appointment_date || !appointment_time || 
        !location_id || !client_first_name || !client_last_name || 
        !client_email || !client_phone || price === undefined) {
      return res.status(400).json({ message: 'Missing required fields' })
    }
    
    // Check for time slot availability (basic check - you might want more sophisticated logic)
    const existingBooking = await query(
      'SELECT id FROM bookings WHERE appointment_date = $1 AND appointment_time = $2 AND location_id = $3 AND status != $4',
      [appointment_date, appointment_time, location_id, 'cancelled']
    )
    
    if (existingBooking.rows.length > 0) {
      return res.status(409).json({ message: 'Time slot is already booked' })
    }
    
    // Create booking
    const result = await query(`
      INSERT INTO bookings (
        client_first_name, client_last_name, client_email, client_phone,
        service_id, location_id, appointment_date, appointment_time,
        duration, price, status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      client_first_name, client_last_name, client_email, client_phone,
      service_id, location_id, appointment_date, appointment_time,
      duration, price, 'pending', notes
    ])
    
    // Here you would integrate with Square API for payment processing
    // For now, we'll just return the booking confirmation
    
    res.status(201).json({
      message: 'Booking created successfully',
      booking: result.rows[0],
      next_steps: {
        payment_required: false,
        confirmation_email: 'will_be_sent',
        booking_id: result.rows[0].id
      }
    })
  } catch (error) {
    console.error('Error creating booking:', error)
    res.status(500).json({ message: 'Failed to create booking' })
  }
})

// Update booking status (admin only)
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { status, payment_status } = req.body
    
    if (!status) {
      return res.status(400).json({ message: 'Status is required' })
    }
    
    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled']
    const validPaymentStatuses = ['pending', 'paid', 'refunded']
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' })
    }
    
    if (payment_status && !validPaymentStatuses.includes(payment_status)) {
      return res.status(400).json({ message: 'Invalid payment status' })
    }
    
    let updateQuery = 'UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP'
    const params = [status]
    let paramCount = 1
    
    if (payment_status) {
      paramCount++
      updateQuery += `, payment_status = $${paramCount}`
      params.push(payment_status)
    }
    
    paramCount++
    updateQuery += ` WHERE id = $${paramCount} RETURNING *`
    params.push(id)
    
    const result = await query(updateQuery, params)
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found' })
    }
    
    res.json({
      message: 'Booking updated successfully',
      booking: result.rows[0]
    })
  } catch (error) {
    console.error('Error updating booking:', error)
    res.status(500).json({ message: 'Failed to update booking' })
  }
})

// Get available time slots for a specific date (optional location_id)
router.get('/availability/:date', async (req, res) => {
  try {
    const { date } = req.params
    const { location_id, duration = 60 } = req.query
    
    // Basic availability logic - you might want to make this more sophisticated
    const allTimeSlots = [
      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
      '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
      '18:00', '18:30'
    ]
    
    // Get booked time slots for the date and location
    let bookedQuery = 'SELECT appointment_time FROM bookings WHERE appointment_date = $1 AND status != $2'
    const params = [date, 'cancelled']
    
    if (location_id) {
      bookedQuery += ' AND location_id = $3'
      params.push(location_id)
    }
    
    const bookedResult = await query(bookedQuery, params)
    const bookedTimes = bookedResult.rows.map(row => row.appointment_time.substring(0, 5))
    
    const availableSlots = allTimeSlots.filter(slot => !bookedTimes.includes(slot))
    
    res.json({
      date,
      location_id: location_id || 'all',
      duration: parseInt(duration),
      available_slots: availableSlots,
      booked_slots: bookedTimes
    })
  } catch (error) {
    console.error('Error fetching availability:', error)
    res.status(500).json({ message: 'Failed to fetch availability' })
  }
})

// Delete booking (admin only)
// Update booking status (admin only)
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body
    
    if (!status) {
      return res.status(400).json({ message: 'Status is required' })
    }
    
    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' })
    }
    
    const result = await query(
      'UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    )
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found' })
    }
    
    res.json({
      message: 'Booking status updated successfully',
      booking: result.rows[0]
    })
  } catch (error) {
    console.error('Error updating booking status:', error)
    res.status(500).json({ message: 'Failed to update booking status' })
  }
})

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    
    const result = await query('DELETE FROM bookings WHERE id = $1 RETURNING id', [id])
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found' })
    }
    
    res.json({ message: 'Booking deleted successfully' })
  } catch (error) {
    console.error('Error deleting booking:', error)
    res.status(500).json({ message: 'Failed to delete booking' })
  }
})

module.exports = router
