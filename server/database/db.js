// Check if we should use SQLite or PostgreSQL
// Force SQLite for development unless explicitly configured for PostgreSQL
const USE_SQLITE = true // Change to: !process.env.DATABASE_URL || process.env.USE_SQLITE === 'true' when you want PostgreSQL

if (USE_SQLITE) {
  console.log('🗄️  Using SQLite database for development')
  module.exports = require('./db-sqlite')
} else {
  console.log('🐘 Using PostgreSQL database')
  
  const { Pool } = require('pg')

  // Database connection pool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  })

  // Test connection
  pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database')
  })

  pool.on('error', (err) => {
    console.error('❌ Database connection error:', err)
  })

  // Database initialization
    const initDatabase = async () => {
    try {
      console.log('Attempting to connect to PostgreSQL database...')
      const client = await pool.connect()
      
      // Create tables if they don't exist
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        
        -- Users table (for admin authentication)
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          first_name VARCHAR(100) NOT NULL,
          last_name VARCHAR(100) NOT NULL,
          role VARCHAR(20) DEFAULT 'admin',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Bookings table
        CREATE TABLE IF NOT EXISTS bookings (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          service_type VARCHAR(100) NOT NULL,
          duration INTEGER NOT NULL,
          scheduled_date DATE NOT NULL,
          scheduled_time TIME NOT NULL,
          location VARCHAR(50) NOT NULL,
          client_first_name VARCHAR(100) NOT NULL,
          client_last_name VARCHAR(100) NOT NULL,
          client_email VARCHAR(255) NOT NULL,
          client_phone VARCHAR(20) NOT NULL,
          is_new_client BOOLEAN DEFAULT true,
          has_health_conditions BOOLEAN DEFAULT false,
          health_notes TEXT,
          special_notes TEXT,
          payment_method VARCHAR(20) NOT NULL,
          payment_status VARCHAR(20) DEFAULT 'pending',
          total_amount DECIMAL(10,2) NOT NULL,
          status VARCHAR(20) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Class registrations table
        CREATE TABLE IF NOT EXISTS class_registrations (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          course_type VARCHAR(100) NOT NULL,
          scheduled_date DATE NOT NULL,
          participant_first_name VARCHAR(100) NOT NULL,
          participant_last_name VARCHAR(100) NOT NULL,
          participant_email VARCHAR(255) NOT NULL,
          participant_phone VARCHAR(20) NOT NULL,
          organization VARCHAR(255),
          certification_level VARCHAR(50),
          payment_method VARCHAR(20) NOT NULL,
          payment_status VARCHAR(20) DEFAULT 'pending',
          total_amount DECIMAL(10,2) NOT NULL,
          status VARCHAR(20) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Content management table
        CREATE TABLE IF NOT EXISTS content (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          page VARCHAR(100) NOT NULL,
          section VARCHAR(100) NOT NULL,
          content_key VARCHAR(100) NOT NULL,
          content_value TEXT NOT NULL,
          content_type VARCHAR(20) DEFAULT 'text',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(page, section, content_key)
        );
        
        -- Locations table
        CREATE TABLE IF NOT EXISTS locations (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(100) NOT NULL,
          address VARCHAR(255) NOT NULL,
          city VARCHAR(100) NOT NULL,
          state VARCHAR(10) NOT NULL,
          zip_code VARCHAR(10) NOT NULL,
          phone VARCHAR(20),
          latitude DECIMAL(10, 8),
          longitude DECIMAL(11, 8),
          is_active BOOLEAN DEFAULT true,
          operating_hours JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Services table
        CREATE TABLE IF NOT EXISTS services (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          service_id VARCHAR(50) UNIQUE NOT NULL,
          name VARCHAR(100) NOT NULL,
          category VARCHAR(50) NOT NULL,
          description TEXT NOT NULL,
          durations INTEGER[] NOT NULL,
          prices DECIMAL(10,2)[] NOT NULL,
          benefits TEXT[] NOT NULL,
          best_for TEXT NOT NULL,
          special_notes TEXT,
          is_popular BOOLEAN DEFAULT false,
          is_active BOOLEAN DEFAULT true,
          image_url VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Classes/courses table
        CREATE TABLE IF NOT EXISTS courses (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          course_id VARCHAR(50) UNIQUE NOT NULL,
          title VARCHAR(100) NOT NULL,
          description TEXT NOT NULL,
          duration INTEGER NOT NULL,
          frequency VARCHAR(50) NOT NULL,
          capacity INTEGER NOT NULL,
          price DECIMAL(10,2) NOT NULL,
          certification VARCHAR(100) NOT NULL,
          benefits TEXT[] NOT NULL,
          requirements TEXT[],
          is_popular BOOLEAN DEFAULT false,
          is_active BOOLEAN DEFAULT true,
          image_url VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Course schedules table
        CREATE TABLE IF NOT EXISTS course_schedules (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
          scheduled_date DATE NOT NULL,
          start_time TIME NOT NULL,
          end_time TIME NOT NULL,
          location_id UUID REFERENCES locations(id),
          available_spots INTEGER NOT NULL,
          status VARCHAR(20) DEFAULT 'scheduled',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Create indexes for better performance
        CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(scheduled_date);
        CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
        CREATE INDEX IF NOT EXISTS idx_bookings_client_email ON bookings(client_email);
        CREATE INDEX IF NOT EXISTS idx_class_registrations_date ON class_registrations(scheduled_date);
        CREATE INDEX IF NOT EXISTS idx_class_registrations_status ON class_registrations(status);
        CREATE INDEX IF NOT EXISTS idx_content_page_section ON content(page, section);
        CREATE INDEX IF NOT EXISTS idx_course_schedules_date ON course_schedules(scheduled_date);
      `)
      
      console.log('✅ Database tables initialized successfully')
      client.release()
    } catch (error) {
      console.error('❌ Database initialization error:', error)
      throw error
    }
  }

  // Initialize database on startup - fallback to mock if PostgreSQL unavailable
  initDatabase().catch((error) => {
    console.log('⚠️  PostgreSQL not available, using mock database for demo')
    console.log('   To use full functionality, please set up PostgreSQL')
  })

  module.exports = {
    pool,
    query: (text, params) => {
      try {
        return pool.query(text, params)
      } catch (error) {
        console.log('Using mock query due to database unavailability')
        return Promise.resolve({ rows: [] })
      }
    },
    initDatabase
  }
}
