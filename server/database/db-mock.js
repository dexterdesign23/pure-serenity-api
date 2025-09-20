// Mock database for development when PostgreSQL is not available
let mockData = {
  users: [],
  bookings: [],
  class_registrations: [],
  content: [],
  locations: [
    {
      id: '1',
      name: 'Bethlehem Office',
      address: '610 West Broad St',
      city: 'Bethlehem',
      state: 'PA',
      zip_code: '18018',
      phone: '(555) 123-4567',
      is_active: true,
      operating_hours: {
        monday: { open: '09:00', close: '19:00' },
        tuesday: { open: '09:00', close: '19:00' },
        wednesday: { open: '09:00', close: '19:00' },
        thursday: { open: '09:00', close: '19:00' },
        friday: { open: '09:00', close: '19:00' },
        saturday: { open: '09:00', close: '17:00' },
        sunday: { closed: true }
      }
    },
    {
      id: '2',
      name: 'Hershey Office',
      address: '24 Northeast Dr',
      city: 'Hershey',
      state: 'PA',
      zip_code: '17033',
      phone: '(555) 123-4567',
      is_active: true,
      operating_hours: {
        monday: { open: '09:00', close: '19:00' },
        tuesday: { open: '09:00', close: '19:00' },
        wednesday: { open: '09:00', close: '19:00' },
        thursday: { open: '09:00', close: '19:00' },
        friday: { open: '09:00', close: '19:00' },
        saturday: { open: '09:00', close: '17:00' },
        sunday: { closed: true }
      }
    }
  ],
  services: [],
  courses: []
}

// Mock query function
const query = (text, params = []) => {
  return new Promise((resolve) => {
    console.log('Mock query:', text, params)
    // For demo purposes, return empty results
    resolve({ rows: [] })
  })
}

module.exports = {
  query,
  mockData
}
