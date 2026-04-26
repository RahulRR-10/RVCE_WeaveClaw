const crypto = require('crypto');
const { getDb } = require('../../db/db');

async function executeSimulated(skill, triggeredBy = 'manual') {
  const results = [];

  for (let i = 0; i < skill.actions.length; i++) {
    const action = skill.actions[i];
    const msg = formatSimulationMessage(action);
    console.log(`[SIMULATION] ${msg}`);
    results.push({ action_index: i, status: 'simulated', response: msg });
  }

  const db = getDb();
  const logId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO execution_logs (id, skill_id, triggered_by, status, actions_result)
    VALUES (?, ?, ?, 'simulated', ?)
  `).run(logId, skill.id, triggeredBy, JSON.stringify(results));

  return { status: 'simulated', actions_result: results, log_id: logId };
}

function formatSimulationMessage(action) {
  const { command, device_id, params } = action;
  const device = device_id || 'device';

  switch (command) {
    case 'turn_on':
      return `[${device}] -> TURNED ON`;
    case 'turn_off':
      return `[${device}] -> TURNED OFF`;
    case 'set_temperature':
      return `[${device}] -> TEMPERATURE SET to ${params?.value}${params?.unit || 'C'}`;
    case 'set_color':
      return `[${device}] -> COLOR SET to ${params?.color || params?.hex}`;
    default:
      return `[${device}] -> ${command.toUpperCase()} executed with ${JSON.stringify(params || {})}`;
  }
}

module.exports = { executeSimulated, formatSimulationMessage };
