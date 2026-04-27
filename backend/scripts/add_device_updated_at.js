require('dotenv').config();
const { getDb } = require('../src/db/db');

const db = getDb();

// Add updated_at column if it doesn't exist
try {
  db.exec("ALTER TABLE devices ADD COLUMN updated_at TEXT");
  console.log('Added updated_at column to devices table');
} catch (err) {
  if (err.message.includes('duplicate column')) {
    console.log('updated_at column already exists');
  } else {
    throw err;
  }
}

console.log('Done.');
