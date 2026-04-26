const express = require('express');
const { getDb } = require('../db/db');
const { executeSkill } = require('../services/skills/skill_executor');
const { parseGithubWebhook } = require('../services/integrations/github_webhook');

const router = express.Router();

// GET /webhooks/generate/:skill_id - get the public webhook URL for a skill.
router.get('/generate/:skill_id', (req, res) => {
  const base = process.env.PUBLIC_WEBHOOK_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  res.json({ webhook_url: `${base}/webhooks/${req.params.skill_id}` });
});

// POST /webhooks/:skill_id - inbound GitHub or generic webhook.
router.post('/:skill_id', async (req, res) => {
  const db = getDb();
  const skill = db.prepare(`
    SELECT * FROM skills WHERE id = ? AND trigger_type = 'webhook' AND is_active = 1
  `).get(req.params.skill_id);

  if (!skill) return res.status(404).json({ error: 'Webhook skill not found' });

  res.json({ received: true, skill_id: req.params.skill_id });

  const payload = req.body || {};
  const parsed = skill.trigger_source === 'github' ? parseGithubWebhook(payload) : payload;
  console.log(`[WEBHOOK] Received for skill ${skill.name}:`, JSON.stringify(parsed).slice(0, 200));

  try {
    const result = await executeSkill(req.params.skill_id, 'webhook');
    console.log(`[WEBHOOK] Executed: ${JSON.stringify(result)}`);
  } catch (err) {
    console.error('[WEBHOOK] Execution failed:', err.message);
  }
});

module.exports = router;
