const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL !== 'false'
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

module.exports = { pool };
