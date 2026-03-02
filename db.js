/* Without ssl it will fail in neon
Without SSL -> it will fail in render */
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
})

async function query(text, params) {
  return pool.query(text, params)
}

module.exports = {
  query,
  pool,
}