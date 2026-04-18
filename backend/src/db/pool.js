const { Pool, types } = require('pg');

// Return DATE columns as strings to avoid timezone issues
types.setTypeParser(1082, val => val);
// Return TIMESTAMP columns as strings
types.setTypeParser(1114, val => val);
types.setTypeParser(1184, val => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected pool error:', err.message);
});

module.exports = pool;
