const express = require('express')
const router = express.Router()
const { query } = require('../database/db')
const { validateBody, validateQuery, z } = require('../middleware/validate')
const { authenticateToken } = require('../middleware/auth')

// Get all classes (main route)
const listClassesQuery = z.object({
  active_only: z.enum(['true','false']).optional(),
  category: z.string().optional(),
})

router.get('/', validateQuery(listClassesQuery), async (req, res) => {
  try {
    const { active_only = 'true', category } = req.query
    
    let queryText = 'SELECT * FROM classes WHERE 1=1'
    const params = []
    let paramCount = 0
    
    // Note: SQLite classes table doesn't have is_active column yet
    // if (active_only === 'true') {
    //   queryText += ` AND is_active = $${++paramCount}`
    //   params.push(true)
    // }
    
    if (category) {
      queryText += ` AND category = $${++paramCount}`
      params.push(category)
    }
    
    queryText += ' ORDER BY class_date DESC, start_time'
    
    const result = await query(queryText, params)
    
    res.json({
      classes: result.rows
    })
  } catch (error) {
    console.error('Error fetching classes:', error)
    res.status(500).json({ message: 'Failed to fetch classes' })
  }
})

// Remove courses endpoints to unify around classes
router.get('/courses', (req, res) => res.status(404).json({ message: 'Not found' }))

// Get course schedules
router.get('/schedules', (req, res) => res.status(404).json({ message: 'Not found' }))

// Get all class registrations (admin only)
const listRegsQuery = z.object({
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  status: z.enum(['pending','paid','refunded']).optional(),
  course_type: z.string().optional(),
})

router.get('/registrations', authenticateToken, validateQuery(listRegsQuery), async (req, res) => {
  try {
    const pageNum = parseInt(req.query.page || '1', 10)
    const limitNum = Math.min(parseInt(req.query.limit || '20', 10), 100)
    const { status, course_type } = req.query
    const offset = (pageNum - 1) * limitNum
    
    let queryText = `
      SELECT 
        ce.id, c.title as class_title, c.class_date as scheduled_date,
        ce.participant_first_name, ce.participant_last_name,
        ce.participant_email, ce.participant_phone,
        ce.payment_status, c.price as total_amount, 'enrolled' as status, ce.enrollment_date as created_at
      FROM class_enrollments ce
      JOIN classes c ON ce.class_id = c.id
      WHERE 1=1
    `
    const params = []
    let paramCount = 0
    
    if (status) {
      paramCount++
      queryText += ` AND ce.payment_status = $${paramCount}`
      params.push(status)
    }
    
    if (course_type) {
      paramCount++
      queryText += ` AND c.title = $${paramCount}`
      params.push(course_type)
    }
    
    queryText += ` ORDER BY ce.enrollment_date DESC`
    
    paramCount++
    queryText += ` LIMIT $${paramCount}`
    params.push(limitNum)
    
    paramCount++
    queryText += ` OFFSET $${paramCount}`
    params.push(offset)
    
    const result = await query(queryText, params)
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM class_enrollments WHERE 1=1'
    const countParams = []
    let countParamCount = 0
    
    if (status) {
      countParamCount++
      countQuery += ` AND payment_status = $${countParamCount}`
      countParams.push(status)
    }
    
    if (course_type) {
      countParamCount++
      countQuery += ` AND class_id IN (SELECT id FROM classes WHERE title = $${countParamCount})`
      countParams.push(course_type)
    }
    
    const countResult = await query(countQuery, countParams)
    const total = parseInt(countResult.rows[0].count)
    
    res.json({
      registrations: result.rows,
      pagination: {
      page: pageNum,
      limit: limitNum,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching registrations:', error)
    res.status(500).json({ message: 'Failed to fetch registrations' })
  }
})

// Create new class registration
const registerClassSchema = z.object({
  class_id: z.number().int().positive(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  participant_first_name: z.string().min(1),
  participant_last_name: z.string().min(1),
  participant_email: z.string().email(),
  participant_phone: z.string().min(7),
  payment_status: z.enum(['pending','paid','refunded']).optional(),
  total_amount: z.number().nonnegative(),
})

router.post('/register', validateBody(registerClassSchema), async (req, res) => {
  try {
    const {
      class_id,
      scheduled_date,
      participant_first_name,
      participant_last_name,
      participant_email,
      participant_phone,
      payment_status = 'pending',
      total_amount
    } = req.body
    
    // Validate required fields
    if (!class_id || !scheduled_date || !participant_first_name || 
        !participant_last_name || !participant_email || !participant_phone || 
        !total_amount) {
      return res.status(400).json({ message: 'Missing required fields' })
    }
    
    // Basic capacity check using classes.current_participants vs max_participants
    const classInfo = await query('SELECT max_participants, current_participants FROM classes WHERE id = $1', [class_id])
    if (classInfo.rows.length === 0) {
      return res.status(404).json({ message: 'Class not found' })
    }
    const { max_participants, current_participants } = classInfo.rows[0]
    if (current_participants >= max_participants) {
      return res.status(409).json({ message: 'Class is full' })
    }
    
    // Create registration
    const result = await query(`
      INSERT INTO class_enrollments (
        class_id, scheduled_date, participant_first_name, participant_last_name,
        participant_email, participant_phone, payment_status, total_amount
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, payment_status as status, enrollment_date as created_at
    `, [
      class_id, scheduled_date, participant_first_name, participant_last_name,
      participant_email, participant_phone, payment_status, total_amount
    ])
    
    res.status(201).json({
      message: 'Registration created successfully',
      registration: result.rows[0],
      next_steps: {
        payment_required: payment_status !== 'paid',
        confirmation_email: 'will_be_sent',
        registration_id: result.rows[0].id
      }
    })
  } catch (error) {
    console.error('Error creating registration:', error)
    res.status(500).json({ message: 'Failed to create registration' })
  }
})

// Update registration status (admin only)
const updateRegSchema = z.object({
  status: z.enum(['pending','confirmed','completed','cancelled']),
  payment_status: z.enum(['pending','paid','refunded']).optional(),
})

router.patch('/registrations/:id/status', authenticateToken, validateBody(updateRegSchema), async (req, res) => {
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
    
    let updateQuery = 'UPDATE class_enrollments SET status = $1, updated_at = CURRENT_TIMESTAMP'
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
      return res.status(404).json({ message: 'Registration not found' })
    }
    
    res.json({
      message: 'Registration updated successfully',
      registration: result.rows[0]
    })
  } catch (error) {
    console.error('Error updating registration:', error)
    res.status(500).json({ message: 'Failed to update registration' })
  }
})

// Add new course schedule (admin only)
router.post('/schedules', authenticateToken, async (req, res) => {
  try {
    return res.status(501).json({ message: 'Course schedules API not available in SQLite mode' })
  } catch (error) {
    console.error('Error creating course schedule:', error)
    res.status(500).json({ message: 'Failed to create course schedule' })
  }
})

// Update course schedule (admin only)
router.put('/schedules/:id', authenticateToken, async (req, res) => {
  try {
    return res.status(501).json({ message: 'Course schedules API not available in SQLite mode' })
  } catch (error) {
    console.error('Error updating schedule:', error)
    res.status(500).json({ message: 'Failed to update schedule' })
  }
})

// Create a class (admin only)
const createClassSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  instructor: z.string().min(1),
  class_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  location_id: z.number().int().positive(),
  max_participants: z.number().int().positive().optional(),
  price: z.number().nonnegative(),
  category: z.string().optional(),
  is_active: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
})

router.post('/', authenticateToken, validateBody(createClassSchema), async (req, res) => {
  try {
    const { title, description, instructor, class_date, start_time, end_time, location_id, max_participants, price, category, is_active = 1 } = req.body
    if (!title || !instructor || !class_date || !start_time || !end_time || !location_id || !price) {
      return res.status(400).json({ message: 'Missing required fields' })
    }
    const result = await query(`
      INSERT INTO classes (title, description, instructor, class_date, start_time, end_time, location_id, max_participants, price, category, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [title, description, instructor, class_date, start_time, end_time, location_id, max_participants || 20, price, category, is_active])
    res.status(201).json({ message: 'Class created successfully', class: result.rows[0] })
  } catch (error) {
    console.error('Error creating class:', error)
    res.status(500).json({ message: 'Failed to create class' })
  }
})

// Update a class (admin only)
const updateClassSchema = createClassSchema.partial()

router.put('/:id', authenticateToken, validateBody(updateClassSchema), async (req, res) => {
  try {
    const { id } = req.params
    const { title, description, instructor, class_date, start_time, end_time, location_id, max_participants, price, category, is_active } = req.body
    const updates = []
    const params = []
    let n = 0
    const add = (frag, val) => { updates.push(`${frag} = $${++n}`); params.push(val) }
    if (title !== undefined) add('title', title)
    if (description !== undefined) add('description', description)
    if (instructor !== undefined) add('instructor', instructor)
    if (class_date !== undefined) add('class_date', class_date)
    if (start_time !== undefined) add('start_time', start_time)
    if (end_time !== undefined) add('end_time', end_time)
    if (location_id !== undefined) add('location_id', location_id)
    if (max_participants !== undefined) add('max_participants', max_participants)
    if (price !== undefined) add('price', price)
    if (category !== undefined) add('category', category)
    if (is_active !== undefined) add('is_active', is_active)
    if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' })
    const result = await query(`
      UPDATE classes SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${++n} RETURNING *
    `, [...params, id])
    if (result.rows.length === 0) return res.status(404).json({ message: 'Class not found' })
    res.json({ message: 'Class updated successfully', class: result.rows[0] })
  } catch (error) {
    console.error('Error updating class:', error)
    res.status(500).json({ message: 'Failed to update class' })
  }
})

// Delete a class (admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const enrollmentCheck = await query('SELECT COUNT(*) as cnt FROM class_enrollments WHERE class_id = $1', [id])
    if (parseInt(enrollmentCheck.rows[0].cnt) > 0) {
      return res.status(409).json({ message: 'Cannot delete class with existing enrollments. Deactivate it instead.' })
    }
    const result = await query('DELETE FROM classes WHERE id = $1 RETURNING id', [id])
    if (result.rows.length === 0) return res.status(404).json({ message: 'Class not found' })
    res.json({ message: 'Class deleted successfully' })
  } catch (error) {
    console.error('Error deleting class:', error)
    res.status(500).json({ message: 'Failed to delete class' })
  }
})

module.exports = router
