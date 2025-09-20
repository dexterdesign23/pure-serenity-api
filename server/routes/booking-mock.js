const express = require('express')
const router = express.Router()

// Mock bookings data
let mockBookings = [
  {
    id: '1',
    service_type: 'Deep Tissue Massage',
    duration: 60,
    scheduled_date: '2024-10-20',
    scheduled_time: '14:00',
    location: 'bethlehem',
    client_first_name: 'Sarah',
    client_last_name: 'Johnson',
    client_email: 'sarah.johnson@email.com',
    client_phone: '(555) 123-4567',
    payment_method: 'venmo',
    payment_status: 'paid',
    total_amount: 100.00,
    status: 'confirmed',
    created_at: '2024-10-15T10:30:00Z'
  },
  {
    id: '2',
    service_type: 'Prenatal Massage',
    duration: 60,
    scheduled_date: '2024-10-22',
    scheduled_time: '10:00',
    location: 'hershey',
    client_first_name: 'Emily',
    client_last_name: 'Davis',
    client_email: 'emily.davis@email.com',
    client_phone: '(555) 987-6543',
    payment_method: 'square',
    payment_status: 'pending',
    total_amount: 95.00,
    status: 'pending',
    created_at: '2024-10-16T14:15:00Z'
  }
]

// Get all bookings (admin only)
router.get('/', async (req, res) => {
  try {
    console.log('📅 Mock: Fetching bookings')
    const { page = 1, limit = 20, status, date } = req.query
    
    let filteredBookings = mockBookings
    
    if (status) {
      filteredBookings = filteredBookings.filter(b => b.status === status)
    }
    
    if (date) {
      filteredBookings = filteredBookings.filter(b => b.scheduled_date === date)
    }
    
    const total = filteredBookings.length
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + parseInt(limit)
    const paginatedBookings = filteredBookings.slice(startIndex, endIndex)
    
    res.json({
      bookings: paginatedBookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching mock bookings:', error)
    res.status(500).json({ message: 'Failed to fetch bookings' })
  }
})

// Create new booking
router.post('/', async (req, res) => {
  try {
    console.log('📅 Mock: Creating booking')
    const newBooking = {
      id: (mockBookings.length + 1).toString(),
      ...req.body,
      status: 'pending',
      payment_status: 'pending',
      created_at: new Date().toISOString()
    }
    
    mockBookings.push(newBooking)
    
    res.status(201).json({
      message: 'Booking created successfully',
      booking: { 
        id: newBooking.id, 
        status: newBooking.status, 
        created_at: newBooking.created_at 
      },
      next_steps: {
        payment_required: true,
        confirmation_email: 'will_be_sent',
        booking_id: newBooking.id
      }
    })
  } catch (error) {
    console.error('Error creating mock booking:', error)
    res.status(500).json({ message: 'Failed to create booking' })
  }
})

module.exports = router
