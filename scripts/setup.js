const bcrypt = require('bcryptjs')
const { Pool } = require('pg')
require('dotenv').config()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

async function setupDatabase() {
  try {
    console.log('🔧 Setting up Pure Serenity database...')
    
    // Create admin user if it doesn't exist
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@serenitymassage.org'
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
    
    // Check if admin user already exists
    const existingAdmin = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail])
    
    if (existingAdmin.rows.length === 0) {
      console.log('👤 Creating admin user...')
      
      const hashedPassword = await bcrypt.hash(adminPassword, 12)
      
      await pool.query(`
        INSERT INTO users (email, password_hash, first_name, last_name, role)
        VALUES ($1, $2, $3, $4, $5)
      `, [adminEmail, hashedPassword, 'Admin', 'User', 'admin'])
      
      console.log(`✅ Admin user created:`)
      console.log(`   Email: ${adminEmail}`)
      console.log(`   Password: ${adminPassword}`)
      console.log('   ⚠️  Please change the password after first login!')
    } else {
      console.log('👤 Admin user already exists')
    }
    
    // Insert default locations
    console.log('📍 Setting up default locations...')
    
    const locations = [
      {
        name: 'Bethlehem Office',
        address: '610 West Broad St',
        city: 'Bethlehem',
        state: 'PA',
        zip_code: '18018',
        phone: '(555) 123-4567',
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
        name: 'Hershey Office',
        address: '24 Northeast Dr',
        city: 'Hershey',
        state: 'PA',
        zip_code: '17033',
        phone: '(555) 123-4567',
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
    ]
    
    for (const location of locations) {
      const existing = await pool.query('SELECT id FROM locations WHERE name = $1', [location.name])
      
      if (existing.rows.length === 0) {
        await pool.query(`
          INSERT INTO locations (name, address, city, state, zip_code, phone, operating_hours, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          location.name, location.address, location.city, location.state,
          location.zip_code, location.phone, JSON.stringify(location.operating_hours), true
        ])
        console.log(`   ✅ Created location: ${location.name}`)
      } else {
        console.log(`   📍 Location already exists: ${location.name}`)
      }
    }
    
    // Insert default services
    console.log('💆 Setting up default services...')
    
    const services = [
      {
        service_id: 'swedish',
        name: 'Swedish Massage',
        category: 'relaxation',
        description: 'Classic relaxation massage using gentle, flowing strokes to promote overall wellness.',
        durations: [30, 60, 90],
        prices: [55.00, 90.00, 125.00],
        benefits: ['Promotes deep relaxation', 'Reduces stress and anxiety', 'Improves sleep quality', 'Boosts circulation', 'Enhances mental clarity'],
        best_for: 'First-time clients, stress relief, general wellness',
        is_popular: true
      },
      {
        service_id: 'deep-tissue',
        name: 'Deep Tissue Massage',
        category: 'therapeutic',
        description: 'Targets deeper layers of muscle and connective tissue to relieve chronic tension and pain.',
        durations: [30, 60, 90],
        prices: [60.00, 100.00, 140.00],
        benefits: ['Reduces chronic muscle tension', 'Improves blood circulation', 'Breaks up scar tissue', 'Helps with injury recovery', 'Reduces inflammation'],
        best_for: 'Athletes, chronic pain sufferers, those with muscle tension',
        is_popular: true
      },
      {
        service_id: 'prenatal',
        name: 'Prenatal Massage',
        category: 'pregnancy',
        description: 'Specialized massage designed to support the changing needs of expecting mothers.',
        durations: [45, 60, 75],
        prices: [75.00, 95.00, 115.00],
        benefits: ['Reduces pregnancy discomfort', 'Improves sleep quality', 'Decreases swelling', 'Relieves back and joint pain', 'Promotes emotional well-being'],
        best_for: 'Expecting mothers (after first trimester)',
        special_notes: 'Safe for all stages of pregnancy after the first trimester',
        is_popular: true
      }
    ]
    
    for (const service of services) {
      const existing = await pool.query('SELECT id FROM services WHERE service_id = $1', [service.service_id])
      
      if (existing.rows.length === 0) {
        await pool.query(`
          INSERT INTO services (
            service_id, name, category, description, durations, prices, 
            benefits, best_for, special_notes, is_popular, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          service.service_id, service.name, service.category, service.description,
          service.durations, service.prices, service.benefits, service.best_for,
          service.special_notes || null, service.is_popular, true
        ])
        console.log(`   ✅ Created service: ${service.name}`)
      } else {
        console.log(`   💆 Service already exists: ${service.name}`)
      }
    }
    
    // Insert default courses
    console.log('🎓 Setting up default courses...')
    
    const courses = [
      {
        course_id: 'cpr-first-aid',
        title: 'CPR/First Aid/AED Training',
        description: 'Comprehensive training in CPR, First Aid, and AED use for healthcare providers and the general public.',
        duration: 240, // 4 hours in minutes
        frequency: 'Monthly - Friday Afternoons',
        capacity: 12,
        price: 85.00,
        certification: 'American Red Cross',
        benefits: ['American Red Cross certification', 'Hands-on practice with mannequins', 'AED training included', 'Valid for 2 years', 'Same-day certification'],
        is_popular: true
      },
      {
        course_id: 'cupping-ce',
        title: 'Cupping Therapy CE',
        description: 'Advanced cupping therapy techniques for licensed massage therapists.',
        duration: 480, // 8 hours in minutes
        frequency: 'Quarterly',
        capacity: 8,
        price: 185.00,
        certification: '8 CE Credits',
        benefits: ['8 continuing education credits', 'Traditional and modern techniques', 'Hands-on practice', 'Take-home materials', 'Certificate of completion'],
        requirements: ['Must be a licensed massage therapist'],
        is_popular: false
      }
    ]
    
    for (const course of courses) {
      const existing = await pool.query('SELECT id FROM courses WHERE course_id = $1', [course.course_id])
      
      if (existing.rows.length === 0) {
        await pool.query(`
          INSERT INTO courses (
            course_id, title, description, duration, frequency, capacity,
            price, certification, benefits, requirements, is_popular, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          course.course_id, course.title, course.description, course.duration,
          course.frequency, course.capacity, course.price, course.certification,
          course.benefits, course.requirements || null, course.is_popular, true
        ])
        console.log(`   ✅ Created course: ${course.title}`)
      } else {
        console.log(`   🎓 Course already exists: ${course.title}`)
      }
    }
    
    console.log('\n🎉 Database setup completed successfully!')
    console.log('\n📋 Next steps:')
    console.log('1. Start the development server: npm run dev')
    console.log('2. Visit http://localhost:3000 for the public website')
    console.log('3. Visit http://localhost:3000/admin for the admin dashboard')
    console.log(`4. Login with: ${adminEmail} / ${adminPassword}`)
    console.log('5. Change the admin password after first login')
    
  } catch (error) {
    console.error('❌ Setup failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Run setup if this script is executed directly
if (require.main === module) {
  setupDatabase()
}

module.exports = { setupDatabase }
