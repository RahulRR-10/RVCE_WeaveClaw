const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db/db');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const suggestions = db.prepare(`
    SELECT * FROM suggestions
    WHERE status = 'pending'
    ORDER BY confidence_score DESC, created_at DESC
  `).all();

  res.json(suggestions.map((suggestion) => ({
    ...suggestion,
    evidence_summary: parseJson(suggestion.evidence_summary, {}),
    suggested_skill: parseJson(suggestion.suggested_skill, {}),
  })));
});

router.post('/:id/accept', (req, res) => {
  const db = getDb();
  const suggestion = db.prepare('SELECT * FROM suggestions WHERE id = ?').get(req.params.id);
  if (!suggestion) return res.status(404).json({ error: 'Suggestion not found' });
  if (suggestion.status !== 'pending') {
    return res.status(409).json({ error: `Suggestion already ${suggestion.status}` });
  }

  const suggestedSkill = parseJson(suggestion.suggested_skill, {});
  const skillId = crypto.randomUUID();
  const metadata = {
    created_at: new Date().toISOString(),
    created_by: 'system_suggested',
    source: 'user_generated',
    tags: ['auto-suggested'],
    execution_count: 0,
    last_executed: null,
    confidence_score: suggestion.confidence_score,
    is_active: true,
  };

  db.prepare(`
    INSERT INTO skills (
      id, name, description, trigger_type, trigger_value, trigger_source,
      trigger_extra, conditions, actions, metadata, is_active
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    skillId,
    suggestedSkill.name || 'Suggested Skill',
    suggestedSkill.description || '',
    suggestedSkill.trigger_type || 'time',
    suggestedSkill.trigger_value || '',
    suggestedSkill.trigger_source || 'schedule',
    stringifyJson(suggestedSkill.trigger_extra, {}),
    stringifyJson(suggestedSkill.conditions, []),
    stringifyJson(suggestedSkill.actions, []),
    JSON.stringify(metadata)
  );

  db.prepare("UPDATE suggestions SET status = 'accepted' WHERE id = ?").run(req.params.id);
  res.json({ message: 'Suggestion accepted', skill_id: skillId });
});

router.post('/:id/dismiss', (req, res) => {
  const db = getDb();
  const result = db.prepare("UPDATE suggestions SET status = 'dismissed' WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Suggestion not found' });
  res.json({ message: 'Suggestion dismissed' });
});

router.post('/:id/edit', (req, res) => {
  const db = getDb();
  const suggestion = db.prepare('SELECT * FROM suggestions WHERE id = ?').get(req.params.id);
  if (!suggestion) return res.status(404).json({ error: 'Suggestion not found' });
  res.json({ suggested_skill: parseJson(suggestion.suggested_skill, {}) });
});

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (_err) {
    return fallback;
  }
}

function stringifyJson(value, fallback) {
  if (typeof value === 'string') return value;
  return JSON.stringify(value || fallback);
}

module.exports = router;
