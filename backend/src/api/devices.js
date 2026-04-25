const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db/db');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const devices = db.prepare('SELECT * FROM devices').all();
  res.json(devices.map(d => ({
    ...d,
    capabilities: JSON.parse(d.capabilities),
    is_online: Boolean(d.is_online),
  })));
});

router.post('/', (req, res) => {
  const { name, type, capabilities, service, external_id } = req.body;
  if (!name || !type || !capabilities || !service) {
    return res.status(400).json({ error: 'name, type, capabilities, service are required' });
  }
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO devices (id, name, type, capabilities, service, external_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, type, JSON.stringify(capabilities), service, external_id || null);
  res.status(201).json({ id, name, type, capabilities, service });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Device not found' });
  res.json({ message: 'Device deleted' });
});

module.exports = router;
