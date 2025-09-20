const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database file path
const dbPath = path.join(__dirname, '../data/pure_serenity.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize SQLite database
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

console.log(`🗄️  SQLite database initialized at: ${dbPath}`);

// Database initialization function
async function initDatabase() {
  console.log('🔧 Initializing SQLite database schema...');
  
  try {
    // Create tables
    db.exec(`
      -- Users table for admin authentication
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Services table
      CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        duration INTEGER NOT NULL, -- minutes
        price DECIMAL(10,2) NOT NULL,
        category TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Locations table
      CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        zip_code TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        is_primary BOOLEAN DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        google_maps_url TEXT,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Bookings table
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_first_name TEXT NOT NULL,
        client_last_name TEXT NOT NULL,
        client_email TEXT NOT NULL,
        client_phone TEXT,
        service_id INTEGER NOT NULL,
        location_id INTEGER NOT NULL,
        appointment_date DATE NOT NULL,
        appointment_time TIME NOT NULL,
        duration INTEGER NOT NULL, -- minutes
        price DECIMAL(10,2) NOT NULL,
        status TEXT DEFAULT 'pending', -- pending, confirmed, completed, cancelled
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_id) REFERENCES services(id),
        FOREIGN KEY (location_id) REFERENCES locations(id)
      );

      -- Classes table
      CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        instructor TEXT NOT NULL,
        class_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        location_id INTEGER NOT NULL,
        max_participants INTEGER DEFAULT 20,
        current_participants INTEGER DEFAULT 0,
        price DECIMAL(10,2) NOT NULL,
        category TEXT, -- 'cpr', 'massage_ce', etc.
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (location_id) REFERENCES locations(id)
      );

      -- Class enrollments table
      CREATE TABLE IF NOT EXISTS class_enrollments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER NOT NULL,
        participant_first_name TEXT NOT NULL,
        participant_last_name TEXT NOT NULL,
        participant_email TEXT NOT NULL,
        participant_phone TEXT,
        enrollment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        payment_status TEXT DEFAULT 'pending', -- pending, paid, refunded
        FOREIGN KEY (class_id) REFERENCES classes(id)
      );

      -- Content management table for dynamic page content
      CREATE TABLE IF NOT EXISTS page_content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_name TEXT NOT NULL,
        section_name TEXT NOT NULL,
        content_type TEXT NOT NULL, -- 'text', 'html', 'image_url'
        content_value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(page_name, section_name)
      );
      
      -- Indexes for frequently filtered columns
      CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(appointment_date);
      CREATE INDEX IF NOT EXISTS idx_classes_date ON classes(class_date);
      CREATE INDEX IF NOT EXISTS idx_enrollments_class ON class_enrollments(class_id);
      CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
    `);

    console.log('✅ SQLite database schema created successfully');
    
    // Insert default data
    await insertDefaultData();
    
    return true;
  } catch (error) {
    console.error('❌ SQLite database initialization error:', error);
    throw error;
  }
}

// Insert default data
async function insertDefaultData() {
  console.log('📝 Inserting default data...');
  
  try {
    // Check if admin user exists
    const existingAdmin = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@serenitymassage.org');
    
    if (!existingAdmin) {
      // Create default admin user (password: admin123)
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      db.prepare(`
        INSERT INTO users (email, password_hash, first_name, last_name, role)
        VALUES (?, ?, ?, ?, ?)
      `).run('admin@serenitymassage.org', hashedPassword, 'Admin', 'User', 'admin');
      
      console.log('👤 Default admin user created: admin@serenitymassage.org / admin123');
    }

    // Insert default location if none exists
    const existingLocation = db.prepare('SELECT * FROM locations LIMIT 1').get();
    if (!existingLocation) {
      db.prepare(`
        INSERT INTO locations (name, address, city, state, zip_code, phone, email, is_primary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'Pure Serenity Massage & Bodyworks',
        '123 Wellness Way',
        'Peaceful City',
        'CA',
        '12345',
        '(555) 123-4567',
        'info@serenitymassage.org',
        1
      );
      console.log('📍 Default location created');
    }

    // Insert default services if none exist
    const existingService = db.prepare('SELECT * FROM services LIMIT 1').get();
    if (!existingService) {
      const services = [
        { name: 'Swedish Massage', description: 'Relaxing full-body massage', duration: 60, price: 80.00, category: 'massage' },
        { name: 'Deep Tissue Massage', description: 'Therapeutic deep muscle work', duration: 60, price: 90.00, category: 'massage' },
        { name: 'Prenatal Massage', description: 'Specialized massage for expecting mothers', duration: 60, price: 85.00, category: 'massage' },
        { name: 'Sports Massage', description: 'Athletic performance and recovery massage', duration: 60, price: 85.00, category: 'massage' },
        { name: 'Hot Stone Massage', description: 'Heated stone therapy massage', duration: 90, price: 120.00, category: 'massage' },
        { name: 'Cupping Therapy', description: 'Traditional cupping treatment', duration: 45, price: 70.00, category: 'therapy' }
      ];

      const insertService = db.prepare(`
        INSERT INTO services (name, description, duration, price, category)
        VALUES (?, ?, ?, ?, ?)
      `);

      services.forEach(service => {
        insertService.run(service.name, service.description, service.duration, service.price, service.category);
      });
      
      console.log('💆 Default services created');
    }

    // Insert default classes if none exist
    const existingClass = db.prepare('SELECT * FROM classes LIMIT 1').get();
    if (!existingClass) {
      const locationId = db.prepare('SELECT id FROM locations WHERE is_primary = 1').get()?.id || 1;
      
      const classes = [
        {
          title: 'CPR/First Aid/AED Certification',
          description: 'American Red Cross certified CPR, First Aid, and AED training',
          instructor: 'Tiffany Young-Poindexter',
          class_date: '2024-01-15',
          start_time: '09:00',
          end_time: '17:00',
          location_id: locationId,
          max_participants: 15,
          price: 75.00,
          category: 'cpr'
        },
        {
          title: 'Massage CE: Cupping Therapy',
          description: 'Continuing education for massage therapists - Cupping techniques',
          instructor: 'Tiffany Young-Poindexter',
          class_date: '2024-01-22',
          start_time: '10:00',
          end_time: '16:00',
          location_id: locationId,
          max_participants: 12,
          price: 120.00,
          category: 'massage_ce'
        }
      ];

      const insertClass = db.prepare(`
        INSERT INTO classes (title, description, instructor, class_date, start_time, end_time, location_id, max_participants, price, category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      classes.forEach(classItem => {
        insertClass.run(
          classItem.title, classItem.description, classItem.instructor,
          classItem.class_date, classItem.start_time, classItem.end_time,
          classItem.location_id, classItem.max_participants, classItem.price, classItem.category
        );
      });
      
      console.log('📚 Default classes created');
    }

    console.log('✅ Default data insertion completed');
  } catch (error) {
    console.error('❌ Error inserting default data:', error);
    throw error;
  }
}

// Query function compatible with existing PostgreSQL code
function query(text, params = []) {
  try {
    // Convert PostgreSQL-style placeholders ($1, $2) to SQLite-style (?, ?)
    let sqliteQuery = text;
    if (params.length > 0) {
      for (let i = params.length; i >= 1; i--) {
        sqliteQuery = sqliteQuery.replace(new RegExp(`\\$${i}`, 'g'), '?');
      }
    }
    
    // Handle RETURNING clauses (SQLite doesn't support them)
    const isReturning = sqliteQuery.toLowerCase().includes('returning');
    let returningColumns = [];
    if (isReturning) {
      const returningMatch = sqliteQuery.match(/returning\s+(.+?)(?:\s|$)/i);
      if (returningMatch) {
        returningColumns = returningMatch[1].split(',').map(col => col.trim());
      }
      sqliteQuery = sqliteQuery.replace(/\s+returning\s+.+/i, '');
    }
    
    if (sqliteQuery.trim().toLowerCase().startsWith('select')) {
      // SELECT query
      const stmt = db.prepare(sqliteQuery);
      const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
      return Promise.resolve({ rows });
    } else {
      // INSERT, UPDATE, DELETE
      const stmt = db.prepare(sqliteQuery);
      const result = params.length > 0 ? stmt.run(...params) : stmt.run();
      
      let rows = [];
      // Handle RETURNING simulation for INSERT
      if (isReturning && result.lastInsertRowid && sqliteQuery.toLowerCase().includes('insert')) {
        try {
          const tableName = sqliteQuery.match(/insert\s+into\s+(\w+)/i)?.[1];
          if (tableName) {
            const selectStmt = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`);
            const newRow = selectStmt.get(result.lastInsertRowid);
            if (newRow) {
              rows = [newRow];
            }
          }
        } catch (err) {
          console.warn('Could not simulate RETURNING clause:', err.message);
        }
      }
      
      return Promise.resolve({ 
        rows,
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid
      });
    }
  } catch (error) {
    return Promise.reject(error);
  }
}

// Close database connection gracefully
process.on('SIGINT', () => {
  console.log('🔒 Closing SQLite database connection...');
  db.close();
  process.exit(0);
});

module.exports = {
  db,
  query,
  initDatabase
};
