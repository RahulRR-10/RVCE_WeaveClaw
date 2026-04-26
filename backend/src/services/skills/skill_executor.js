const crypto = require('crypto');
const { getDb } = require('../../db/db');
const { executeSmartThings } = require('../integrations/smartthings');

async function executeSkill(skillId, triggeredBy = 'manual') {
  const db = getDb();
  const row = db.prepare('SELECT * FROM skills WHERE id = ? AND is_active = 1').get(skillId);
  if (!row) throw new Error(`Skill ${skillId} not found or inactive`);

  const skill = {
    ...row,
    actions: JSON.parse(row.actions),
    conditions: JSON.parse(row.conditions || '[]'),
    metadata: JSON.parse(row.metadata || '{}'),
  };

  const results = [];
  const useSimulation = process.env.SIMULATION_MODE === 'true';

  for (let i = 0; i < skill.actions.length; i++) {
    const action = skill.actions[i];

    try {
      let response;
      if (useSimulation || action.service === 'simulation') {
        const msg = formatMessage(action);
        response = { simulated: true, message: msg };
        console.log(`[SIM] ${msg}`);
      } else if (action.service === 'smartthings') {
        response = await executeSmartThings(action);
      } else {
        response = { message: `Service ${action.service} not yet implemented` };
      }

      results.push({ action_index: i, status: 'success', response });
    } catch (err) {
      results.push({ action_index: i, status: 'failed', error: err.message });
    }
  }

  const allSuccess = results.every(r => r.status === 'success');
  const anySuccess = results.some(r => r.status === 'success');
  const status = useSimulation ? 'simulated' : (allSuccess ? 'success' : anySuccess ? 'partial' : 'failed');

  const logId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO execution_logs (id, skill_id, triggered_by, status, actions_result)
    VALUES (?, ?, ?, ?, ?)
  `).run(logId, skillId, triggeredBy, status, JSON.stringify(results));

  return { status, actions_result: results, log_id: logId, skill_name: skill.name };
}

function formatMessage(action) {
  const { command, device_id, params } = action;
  const device = device_id || 'device';

  if (command === 'turn_on') return `${device} -> ON`;
  if (command === 'turn_off') return `${device} -> OFF`;
  if (command === 'set_temperature') return `${device} -> ${params?.value}${params?.unit || 'C'}`;
  if (command === 'set_color') return `${device} -> color ${params?.hex || params?.color}`;
  return `${device} -> ${command}`;
}

module.exports = { executeSkill, formatMessage };
