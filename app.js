#!/usr/bin/env node

const path = require('path')
const fs = require('fs')

process.env.NODE_ENV = process.env.NODE_ENV || 'production'

const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath })
}

console.log('🚀 Starting Pure Serenity API (pure-serenity-api) ...')
console.log('📍 Environment:', process.env.NODE_ENV)
console.log('🔑 JWT_SECRET:', process.env.JWT_SECRET ? 'Set ✓' : 'Missing ✗')

let app
try {
  app = require('./server/server.js')
  console.log('✅ Server module loaded successfully')
} catch (err) {
  console.error('❌ Failed to load server module:', err)
  throw err
}

if (typeof(PhusionPassenger) !== 'undefined') {
  PhusionPassenger.configure({ autoInstall: false })
  console.log('✈️  Running under Passenger')
}

module.exports = app




