const crypto = require('crypto');
const express = require('express');
const { getDb } = require('../db/db');
const { extractIntent } = require('../services/nlp/intent_extractor');
const { storePartial, getPartial, clearPartial, mergeEntity } = require('../services/nlp/clarification_handler');
const { handleExecuteExisting } = require('../services/nlp/skill_executor_handler');
const { buildSkillFromIntent } = require('../services/nlp/skill_builder');
const { validateSkill } = require('../services/skills/skill_validator');
const { detectConflict } = require('../services/skills/conflict_detector');
const { semanticValidate } = require('../services/skills/semantic_validator');
const { executeSkill } = require('../services/skills/skill_executor');
const { scheduleWatcher } = require('../services/watchers/watcher_runner');

const router = express.Router();

router.post('/', async (req, res) => {
  const { message, session_id } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.json({
      type: 'error',
      reason: 'unparseable_intent',
      message: "I'm not sure what you want me to do. Can you give me a bit more detail?",
    });
  }

  const sessionId = session_id || crypto.randomUUID();
  const db = getDb();

  try {
    // ─── Resume partial / clarification session ────────────────
    const partial = getPartial(sessionId);
    if (partial) {
      const missingKey = partial.missing_entities?.[0] || 'clarification';
      const mergedIntent = mergeEntity(partial, missingKey, message);
      mergedIntent.raw_input = partial.raw_input || message;

      if (!mergedIntent.clarification_needed) {
        clearPartial(sessionId);

        // If this was a device_command that needed clarification, auto-execute
        if (mergedIntent.intent === 'device_command') {
          return await executeDeviceCommand(mergedIntent, sessionId, db, res);
        }

        // If this was a watcher that has been confirmed, register it
        if (mergedIntent.intent === 'watcher' && mergedIntent._confirmed) {
          return registerWatcher(mergedIntent, sessionId, db, res);
        }

        // ── RE-CLASSIFY the clarification response ──────────────
        // The user might respond to "what do you want to do?" with
        // "set an alarm at 6am" — that's a device command, not a
        // generic skill. Re-run the rule classifier on the raw
        // response to detect actionable commands.
        const { ruleClassify } = require('../services/nlp/rule_classifier');
        const recheck = ruleClassify(message);
        if (recheck.intent === 'device_command' && recheck.actions?.length > 0) {
          // Upgrade: use the parsed device actions
          mergedIntent.intent = 'device_command';
          mergedIntent.actions = recheck.actions;
          return await executeDeviceCommand(mergedIntent, sessionId, db, res);
        }

        return createSkillFromIntent(mergedIntent, sessionId, db, res);
      }

      storePartial(sessionId, mergedIntent);
      const promptText = mergedIntent.clarification_prompt || 'Can you give more details?';
      return res.json({
        type: 'clarification_needed',
        session_id: sessionId,
        prompt: promptText,
        question: promptText,
        context: {
          intent: mergedIntent.intent,
          entities: mergedIntent.entities,
        },
      });
    }

    // ─── Fresh intent extraction ───────────────────────────────
    const existingTriggers = db.prepare(`
      SELECT trigger_value FROM skills WHERE trigger_type = 'natural_language' AND is_active = 1
    `).all().map(skill => skill.trigger_value);

    const intent = await extractIntent(message, existingTriggers);
    if (!intent) {
      return res.json({
        type: 'error',
        reason: 'unparseable_intent',
        message: "I'm not sure what you want me to do. Can you give me a bit more detail?",
      });
    }

    intent.raw_input = message;

    // ─── Handle unparseable intent from rule classifier ────────
    if (intent.intent === 'unparseable') {
      return res.json({
        type: 'error',
        reason: 'unparseable_intent',
        message: intent.clarification_prompt || "I'm not sure what you want me to do. Can you give me a bit more detail?",
      });
    }

    // ─── Execute existing skill ────────────────────────────────
    if (intent.intent === 'execute_existing_skill') {
      const result = await handleExecuteExisting(message);
      if (result) return res.json(result);
    }

    // ─── Watcher intent: enter clarification loop ──────────────
    if (intent.intent === 'watcher') {
      storePartial(sessionId, intent);
      const promptText = intent.clarification_prompt || 'Which repo should I watch? Use owner/repo format, e.g. rahul/my-project.';
      return res.json({
        type: 'clarification_needed',
        session_id: sessionId,
        prompt: promptText,
        question: promptText,
        context: {
          intent: intent.intent,
          entities: intent.entities,
        },
      });
    }

    // ─── Clarification needed ──────────────────────────────────
    if (intent.clarification_needed || intent.intent === 'clarification_needed') {
      storePartial(sessionId, intent);
      const promptText = intent.clarification_prompt || 'Can you give more details?';
      return res.json({
        type: 'clarification_needed',
        session_id: sessionId,
        prompt: promptText,
        question: promptText,
        context: {
          intent: intent.intent,
          entities: intent.entities,
        },
      });
    }

    // ─── Device command: auto-execute immediately ──────────────
    if (intent.intent === 'device_command') {
      return await executeDeviceCommand(intent, sessionId, db, res);
    }

    // ─── All other intents: save as skill ──────────────────────
    return createSkillFromIntent(intent, sessionId, db, res);
  } catch (err) {
    console.error('[CHAT] Error:', err);
    return res.status(500).json({
      type: 'error',
      reason: 'internal_error',
      message: 'Something went wrong on my end. Please try again.',
    });
  }
});

// ─── Auto-execute device commands ─────────────────────────────────
// Build skill → save to DB → execute immediately → return result.
async function executeDeviceCommand(intent, sessionId, db, res) {
  try {
    const skillData = buildSkillFromIntent(intent, sessionId);

    const validation = validateSkill(skillData);
    if (!validation.valid) {
      return res.json({ type: 'validation_error', errors: validation.errors });
    }

    // Save the skill to DB first (so execution log can reference it)
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

    // Execute the skill immediately (same path as POST /skills/:id/execute)
    const result = await executeSkill(id, 'user_input');

    // Check if any action returned a clarification_needed (e.g. app not found)
    const clarification = result.actions_result?.find(
      r => r.response?.clarification_needed
    );
    if (clarification) {
      // Store context for the follow-up reply
      const clarificationContext = {
        ...intent,
        clarification_needed: true,
        clarification_prompt: clarification.response.question,
        missing_entities: ['app_package'],
        pending_skill_id: id,
      };
      storePartial(sessionId, clarificationContext);

      const promptText = clarification.response.question;
      return res.json({
        type: 'clarification_needed',
        session_id: sessionId,
        prompt: promptText,
        question: promptText,
        context: clarification.response.context || {},
      });
    }

    return res.json({
      type: 'skill_executed',
      session_id: sessionId,
      result,
    });
  } catch (err) {
    console.error('[CHAT] Device command execution failed:', err);

    // Emulator offline
    if (err.reason === 'emulator_offline' || err.code === 'EMULATOR_OFFLINE' ||
        (err.message && err.message.includes('emulator'))) {
      return res.json({
        type: 'error',
        reason: 'emulator_offline',
        message: "I can't reach the emulator right now. Is it running?",
      });
    }

    // App not found (after clarification exhausted)
    if (err.reason === 'app_not_found') {
      return res.json({
        type: 'error',
        reason: 'app_not_found',
        message: err.message || "I couldn't find that app on the emulator.",
      });
    }

    return res.json({
      type: 'error',
      reason: 'internal_error',
      message: 'Something went wrong while executing the command. Please try again.',
    });
  }
}

function createSkillFromIntent(intent, sessionId, db, res) {
  const skillData = buildSkillFromIntent(intent, sessionId);

  const validation = validateSkill(skillData);
  if (!validation.valid) {
    return res.json({ type: 'validation_error', errors: validation.errors });
  }

  const semantic = semanticValidate(validation.data, db);
  if (semantic.errors.length > 0) {
    return res.json({ type: 'validation_error', errors: semantic.errors });
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

// ─── Register a watcher after clarification is complete ─────────
function registerWatcher(intent, sessionId, db, res) {
  try {
    const entities = intent.entities || {};
    const repo = entities.repo;
    const branch = entities.branch || 'main';
    const pollInterval = entities.poll_interval || 60;
    const notifyChannel = entities.notify_channel || 'in_app';

    if (!repo) {
      return res.json({
        type: 'error',
        reason: 'invalid_watcher_config',
        message: 'No repository specified. Please try again.',
      });
    }

    const id = crypto.randomUUID();
    const config = {
      repo,
      branch,
      poll_interval_seconds: pollInterval,
    };

    db.prepare(`
      INSERT INTO watchers (id, type, config, notify_via)
      VALUES (?, ?, ?, ?)
    `).run(id, 'github_commits', JSON.stringify(config), notifyChannel === 'push' ? 'push' : 'in_app');

    const watcher = db.prepare('SELECT * FROM watchers WHERE id = ?').get(id);

    // Start polling immediately
    scheduleWatcher({
      ...watcher,
      config: JSON.stringify(config),
    });

    const { formatInterval } = require('../services/nlp/clarification_handler');
    const intervalStr = formatInterval(pollInterval);

    console.log(`[CHAT] Watcher registered: ${repo} on ${branch} every ${intervalStr}`);

    return res.json({
      type: 'watcher_created',
      session_id: sessionId,
      message: `Done! I'm now watching ${repo} on ${branch} every ${intervalStr}. I'll notify you ${notifyChannel === 'push' ? 'via push notification' : 'in-app'} when new commits land.`,
      watcher: {
        id,
        type: 'github_commits',
        config,
        notify_via: notifyChannel === 'push' ? 'push' : 'in_app',
      },
    });
  } catch (err) {
    console.error('[CHAT] Watcher registration failed:', err);
    return res.json({
      type: 'error',
      reason: 'internal_error',
      message: 'Something went wrong while setting up the watcher. Please try again.',
    });
  }
}

module.exports = router;
