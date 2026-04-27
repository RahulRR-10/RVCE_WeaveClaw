require('dotenv').config();
const path = require('path');
const { getDb } = require('../src/db/db');

const db = getDb();

// SQLite doesn't support ALTER TABLE to modify CHECK constraints.
// We need to recreate the devices table with the new constraint that includes 'openclaw'.
console.log('[MIGRATE] Recreating devices table to add openclaw service support...');

// 1. Save existing data
const existingDevices = db.prepare('SELECT * FROM devices').all();
console.log(`[MIGRATE] Found ${existingDevices.length} existing devices`);

// 2. Drop old table
db.exec('DROP TABLE IF EXISTS devices');

// 3. Recreate with updated CHECK constraint
db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    capabilities TEXT NOT NULL,
    service TEXT NOT NULL CHECK(service IN ('smartthings','simulation','openclaw','samsung_health')),
    external_id TEXT,
    is_online INTEGER DEFAULT 1,
    registered_at TEXT DEFAULT (datetime('now'))
  )
`);

// 4. Re-insert data, migrating 'simulation' -> 'openclaw'
const insert = db.prepare(`
  INSERT INTO devices (id, name, type, capabilities, service, external_id, is_online, registered_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const d of existingDevices) {
  const newService = d.service === 'simulation' ? 'openclaw' : d.service;
  insert.run(d.id, d.name, d.type, d.capabilities, newService, d.external_id, d.is_online, d.registered_at);
}

console.log(`[MIGRATE] Devices table recreated. ${existingDevices.length} devices migrated.`);

// 5. Update existing skill actions that reference simulation service
const skills = db.prepare('SELECT id, actions FROM skills').all();
let skillsUpdated = 0;
for (const skill of skills) {
  const actions = JSON.parse(skill.actions);
  let changed = false;
  for (const action of actions) {
    if (action.service === 'simulation') {
      action.service = 'openclaw';
      changed = true;
    }
  }
  if (changed) {
    db.prepare('UPDATE skills SET actions = ? WHERE id = ?').run(JSON.stringify(actions), skill.id);
    skillsUpdated++;
  }
}
console.log(`[MIGRATE] Updated ${skillsUpdated} skills from 'simulation' to 'openclaw' service`);

// 6. Show final state
const devices = db.prepare('SELECT name, service FROM devices').all();
console.log('[MIGRATE] Final device state:', devices);

console.log('\n✅ Migration complete! Restart the backend server for changes to take effect.');
