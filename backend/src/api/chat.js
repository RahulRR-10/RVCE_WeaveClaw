const crypto = require('crypto');
const express = require('express');
const { getDb } = require('../db/db');
const { extractIntent } = require('../services/nlp/intent_extractor');
const { storePartial, getPartial, clearPartial, mergeEntity } = require('../services/nlp/clarification_handler');
const { handleExecuteExisting } = require('../services/nlp/skill_executor_handler');
const { buildSkillFromIntent } = require('../services/nlp/skill_builder');
const { validateSkill } = require('../services/skills/skill_validator');
const { detectConflict } = require('../services/skills/conflict_detector');

const router = express.Router();

router.post('/', async (req, res) => {
  const { message, session_id } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message is required' });

  const sessionId = session_id || crypto.randomUUID();
  const db = getDb();

  try {
    const partial = getPartial(sessionId);
    if (partial) {
      const missingKey = partial.missing_entities?.[0] || 'clarification';
      const mergedIntent = mergeEntity(partial, missingKey, message);
      mergedIntent.raw_input = partial.raw_input || message;

      if (!mergedIntent.clarification_needed) {
        clearPartial(sessionId);
        return createSkillFromIntent(mergedIntent, sessionId, db, res);
      }

      storePartial(sessionId, mergedIntent);
      return res.json({
        type: 'clarification_needed',
        session_id: sessionId,
        prompt: mergedIntent.clarification_prompt || 'Can you give more details?',
      });
    }

    const existingTriggers = db.prepare(`
      SELECT trigger_value FROM skills WHERE trigger_type = 'natural_language' AND is_active = 1
    `).all().map(skill => skill.trigger_value);

    const intent = await extractIntent(message, existingTriggers);
    if (!intent) {
      return res.json({ type: 'error', message: 'Could not understand your request. Please try rephrasing.' });
    }

    intent.raw_input = message;

    if (intent.intent === 'execute_existing_skill') {
      const result = await handleExecuteExisting(message);
      if (result) return res.json(result);
    }

    if (intent.clarification_needed || intent.intent === 'clarification_needed') {
      storePartial(sessionId, intent);
      return res.json({
        type: 'clarification_needed',
        session_id: sessionId,
        prompt: intent.clarification_prompt || 'Can you give more details?',
      });
    }

    return createSkillFromIntent(intent, sessionId, db, res);
  } catch (err) {
    console.error('[CHAT] Error:', err);
    return res.status(500).json({ type: 'error', message: 'Internal error: ' + err.message });
  }
});

function createSkillFromIntent(intent, sessionId, db, res) {
  const skillData = buildSkillFromIntent(intent, sessionId);

  const validation = validateSkill(skillData);
  if (!validation.valid) {
    return res.json({ type: 'validation_error', errors: validation.errors });
  }

  const conflict = detectConflict(skillData, db);
  if (conflict?.conflict_detected || conflict?.hasConflict) {
    return res.json({ type: 'conflict_detected', conflict, session_id: sessionId });
  }

  const duplicate = findDuplicateSkill(db, validation.data);
  if (duplicate) {
    return res.json({
      type: 'duplicate_skill',
      session_id: sessionId,
      existing_skill_id: duplicate.id,
      message: 'A skill with this trigger already exists.',
    });
  }

  const id = crypto.randomUUID();
  const { name, description, trigger, conditions, actions } = validation.data;
  const metadata = {
    created_at: new Date().toISOString(),
    created_by: skillData.created_by || 'user',
    source: skillData.source || 'user_generated',
    tags: skillData.tags || [],
    execution_count: 0,
    last_executed: null,
    confidence_score: null,
    is_active: true,
  };

  db.prepare(`
    INSERT INTO skills (id, name, description, trigger_type, trigger_value, trigger_source,
      trigger_extra, conditions, actions, metadata, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id,
    name,
    description || '',
    trigger.type,
    trigger.value || '',
    trigger.source || null,
    JSON.stringify({ event: trigger.event, recurrence: trigger.recurrence, repo: trigger.repo }),
    JSON.stringify(conditions || []),
    JSON.stringify(actions),
    JSON.stringify(metadata)
  );

  const created = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
  return res.json({
    type: 'skill_created',
    session_id: sessionId,
    skill: {
      ...created,
      actions: JSON.parse(created.actions),
      conditions: JSON.parse(created.conditions),
      metadata: JSON.parse(created.metadata),
      trigger_extra: created.trigger_extra ? JSON.parse(created.trigger_extra) : null,
      is_active: Boolean(created.is_active),
    },
  });
}

function findDuplicateSkill(db, skill) {
  const trigger = skill.trigger;
  if (trigger.type === 'webhook') {
    return db.prepare(`
      SELECT id FROM skills
      WHERE trigger_type = 'webhook' AND trigger_source = ?
        AND json_extract(trigger_extra, '$.event') = ? AND is_active = 1
    `).get(trigger.source || null, trigger.event || null);
  }

  return db.prepare(`
    SELECT id FROM skills
    WHERE trigger_value = ? AND trigger_type = ? AND is_active = 1
  `).get(trigger.value || '', trigger.type);
}

module.exports = router;
