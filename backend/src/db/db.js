const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db;

function getDb() {
  if (!db) {
    const dbPath = process.env.DB_PATH || './WeaveClaw.db';
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Run schema
    const schema = fs.readFileSync(
      path.join(__dirname, 'schema.sql'), 'utf8'
    );
    db.exec(schema);
  }
  return db;
}

module.exports = { getDb };
