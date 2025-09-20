const express = require('express')
const router = express.Router()

// Mock locations data
const mockLocations = [
  {
    id: '1',
    name: 'Bethlehem Office',
    address: '610 West Broad St',
    city: 'Bethlehem',
    state: 'PA',
    zip_code: '18018',
    phone: '(555) 123-4567',
    latitude: 40.6259,
    longitude: -75.3704,
    is_active: true,
    operating_hours: {
      monday: { open: '09:00', close: '19:00' },
      tuesday: { open: '09:00', close: '19:00' },
      wednesday: { open: '09:00', close: '19:00' },
      thursday: { open: '09:00', close: '19:00' },
      friday: { open: '09:00', close: '19:00' },
      saturday: { open: '09:00', close: '17:00' },
      sunday: { closed: true }
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: '2',
    name: 'Hershey Office',
    address: '24 Northeast Dr',
    city: 'Hershey',
    state: 'PA',
    zip_code: '17033',
    phone: '(555) 123-4567',
    latitude: 40.2862,
    longitude: -76.6502,
    is_active: true,
    operating_hours: {
      monday: { open: '09:00', close: '19:00' },
      tuesday: { open: '09:00', close: '19:00' },
      wednesday: { open: '09:00', close: '19:00' },
      thursday: { open: '09:00', close: '19:00' },
      friday: { open: '09:00', close: '19:00' },
      saturday: { open: '09:00', close: '17:00' },
      sunday: { closed: true }
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
]

// Get all locations
router.get('/', async (req, res) => {
  try {
    console.log('📍 Mock: Fetching locations')
    const { active_only = 'true' } = req.query
    
    let locations = mockLocations
    if (active_only === 'true') {
      locations = mockLocations.filter(loc => loc.is_active)
    }
    
    res.json(locations)
  } catch (error) {
    console.error('Error fetching mock locations:', error)
    res.status(500).json({ message: 'Failed to fetch locations' })
  }
})

// Get single location by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const location = mockLocations.find(loc => loc.id === id)
    
    if (!location) {
      return res.status(404).json({ message: 'Location not found' })
    }
    
    res.json(location)
  } catch (error) {
    console.error('Error fetching mock location:', error)
    res.status(500).json({ message: 'Failed to fetch location' })
  }
})

module.exports = router
