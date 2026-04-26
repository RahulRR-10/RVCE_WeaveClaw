const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db/db');
const { validateSkill } = require('../services/skills/skill_validator');
const { executeSkill } = require('../services/skills/skill_executor');

const router = express.Router();

// GET /skills
router.get('/', (req, res) => {
  const db = getDb();
  const skills = db.prepare(`
    SELECT s.*, 
      (SELECT COUNT(*) FROM execution_logs WHERE skill_id = s.id) as execution_count,
      (SELECT MAX(executed_at) FROM execution_logs WHERE skill_id = s.id) as last_executed
    FROM skills s ORDER BY s.created_at DESC
  `).all();
  
  res.json(skills.map(s => ({
    ...s,
    conditions: JSON.parse(s.conditions),
    actions: JSON.parse(s.actions),
    metadata: JSON.parse(s.metadata),
    trigger_extra: s.trigger_extra ? JSON.parse(s.trigger_extra) : null,
    is_active: Boolean(s.is_active),
  })));
});

// GET /skills/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  res.json({
    ...skill,
    conditions: JSON.parse(skill.conditions),
    actions: JSON.parse(skill.actions),
    metadata: JSON.parse(skill.metadata),
    trigger_extra: skill.trigger_extra ? JSON.parse(skill.trigger_extra) : null,
    is_active: Boolean(skill.is_active),
  });
});

// POST /skills
// NOTE: semantic_validator and conflict_detector imports are added here in Phase 4.
// At Phase 1, only syntactic (Zod) validation and a basic duplicate check run.
// After completing Phase 4, update this route to also call semanticValidate() and
// detectConflict() — see Phase 4.4 for the exact insertion point.
router.post('/', (req, res) => {
  const validation = validateSkill(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
  }

  const { name, description, trigger, conditions, actions } = validation.data;
  const db = getDb();
  const id = crypto.randomUUID();

  // FIX: Previous version checked WHERE trigger_value = ? AND trigger_type = ? for all
  // trigger types. For webhook skills trigger_value is always empty — any two webhook
  // skills (even for different repos/events) would trip this check incorrectly.
  // Fixed: webhook uniqueness is source + event; all other types use trigger_value.
  const existing = trigger.type === 'webhook'
    ? db.prepare(`
        SELECT id FROM skills
        WHERE trigger_type = 'webhook' AND trigger_source = ?
          AND json_extract(trigger_extra, '$.event') = ? AND is_active = 1
      `).get(trigger.source || null, trigger.event || null)
    : db.prepare(`
        SELECT id FROM skills
        WHERE trigger_value = ? AND trigger_type = ? AND is_active = 1
      `).get(trigger.value || '', trigger.type);

  if (existing) {
    return res.status(409).json({
      error: 'Duplicate skill',
      message: 'A skill with this trigger already exists',
      existing_skill_id: existing.id
    });
  }

  const metadata = {
    created_at: new Date().toISOString(),
    created_by: req.body.created_by || 'user',
    source: req.body.source || 'user_generated',
    tags: req.body.tags || [],
    execution_count: 0,
    last_executed: null,
    confidence_score: req.body.confidence_score || null,
    is_active: true,
  };

  db.prepare(`
    INSERT INTO skills (id, name, description, trigger_type, trigger_value, trigger_source,
      trigger_extra, conditions, actions, metadata, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id, name, description || '', trigger.type, trigger.value || '',
    trigger.source || null,
    JSON.stringify({ event: trigger.event, recurrence: trigger.recurrence, repo: trigger.repo }),
    JSON.stringify(conditions), JSON.stringify(actions), JSON.stringify(metadata)
  );

  const created = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
  res.status(201).json({
    ...created,
    conditions: JSON.parse(created.conditions),
    actions: JSON.parse(created.actions),
    metadata: JSON.parse(created.metadata),
    is_active: Boolean(created.is_active),
  });
});

// PUT /skills/:id
// BUG FIX: Previous version spread skill.actions (a JSON array) into an object — wrong shape for Zod.
// Validation result was also never checked. UPDATE only wrote name/description, silently discarding
// trigger/actions/conditions changes. Fixed: reconstruct full skill from existing DB row, merge with
// req.body at the right level, validate, check the result, then UPDATE all mutable columns.
router.put('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Skill not found' });

  // Reconstruct the existing skill into the shape validateSkill expects
  const existing = {
    name: row.name,
    description: row.description,
    trigger: {
      type: row.trigger_type,
      value: row.trigger_value,
      source: row.trigger_source,
      ...(row.trigger_extra ? JSON.parse(row.trigger_extra) : {}),
    },
    conditions: JSON.parse(row.conditions || '[]'),
    actions: JSON.parse(row.actions),
  };

  // Merge with req.body — caller only needs to send the fields they want to change
  const merged = {
    ...existing,
    ...req.body,
    // If caller sends a partial trigger object, deep-merge it instead of replacing
    trigger: req.body.trigger ? { ...existing.trigger, ...req.body.trigger } : existing.trigger,
  };

  const validation = validateSkill(merged);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
  }

  const { name, description, trigger, conditions, actions } = validation.data;
  db.prepare(`
    UPDATE skills
    SET name = ?, description = ?,
        trigger_type = ?, trigger_value = ?, trigger_source = ?,
        trigger_extra = ?, conditions = ?, actions = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name,
    description || '',
    trigger.type,
    trigger.value || '',
    trigger.source || null,
    JSON.stringify({ event: trigger.event, recurrence: trigger.recurrence, repo: trigger.repo }),
    JSON.stringify(conditions),
    JSON.stringify(actions),
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM skills WHERE id = ?').get(req.params.id);
  res.json({
    ...updated,
    conditions: JSON.parse(updated.conditions),
    actions: JSON.parse(updated.actions),
    metadata: JSON.parse(updated.metadata),
    is_active: Boolean(updated.is_active),
  });
});

// DELETE /skills/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM skills WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Skill not found' });
  res.json({ message: 'Skill deleted' });
});

// PATCH /skills/:id/toggle
router.patch('/:id/toggle', (req, res) => {
  const db = getDb();
  const skill = db.prepare('SELECT is_active FROM skills WHERE id = ?').get(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  const newStatus = skill.is_active ? 0 : 1;
  db.prepare("UPDATE skills SET is_active = ? WHERE id = ?").run(newStatus, req.params.id);
  res.json({ is_active: Boolean(newStatus) });
});

// POST /skills/:id/execute - manual trigger
router.post('/:id/execute', async (req, res) => {
  try {
    const result = await executeSkill(req.params.id, 'manual');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /skills/:id/executions
router.get('/:id/executions', (req, res) => {
  const db = getDb();
  const logs = db.prepare(`
    SELECT * FROM execution_logs WHERE skill_id = ? ORDER BY executed_at DESC LIMIT 50
  `).all(req.params.id);
  res.json(logs.map(l => ({ ...l, actions_result: JSON.parse(l.actions_result || '[]') })));
});

module.exports = router;
