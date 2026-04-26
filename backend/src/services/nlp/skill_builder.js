const { getDb } = require('../../db/db');

function buildSkillFromIntent(intent) {
  const db = getDb();
  const devices = db.prepare('SELECT * FROM devices').all();

  const actions = (intent.actions || []).map(action => {
    const matchedDevice = findDevice(devices, action.device);
    return {
      service: matchedDevice ? matchedDevice.service : 'simulation',
      device_id: matchedDevice ? matchedDevice.id : (action.device || undefined),
      command: action.command || 'turn_off',
      params: buildParams(action),
    };
  });

  if (!actions.length) {
    actions.push({
      service: 'simulation',
      command: 'log',
      params: { message: 'Skill executed' },
    });
  }

  return {
    name: generateSkillName(intent),
    description: `Auto-generated from: "${intent.raw_input || ''}"`,
    trigger: {
      type: intent.trigger_type || 'natural_language',
      value: intent.trigger_value || intent.entities?.raw || intent.raw_input || '',
      source: intent.trigger_source || 'user_input',
      event: intent.trigger_event,
      recurrence: intent.trigger_extra?.recurrence,
      repo: intent.entities?.repo || intent.trigger_extra?.repo,
    },
    conditions: [],
    actions,
    tags: inferTags(intent),
    created_by: 'user',
    source: 'user_generated',
  };
}

function buildSkillDraft(intent) {
  return buildSkillFromIntent(intent || {});
}

function findDevice(devices, reference) {
  if (!reference || typeof reference !== 'string' || reference.trim() === '') return null;

  const ref = reference.trim().toLowerCase();

  const byId = devices.find(device => device.id.toLowerCase() === ref);
  if (byId) return byId;

  const byName = devices.find(device => device.name.toLowerCase() === ref);
  if (byName) return byName;

  const singularRef = ref.replace(/s$/, '');
  const byType = devices.find(device => device.type.toLowerCase() === singularRef);
  if (byType) return byType;

  const refTokens = ref.split(/\s+/).filter(Boolean).map(token => token.replace(/s$/, ''));
  const bySlug = devices.find(device => {
    const nameTokens = device.name.toLowerCase().split(/\s+/).map(token => token.replace(/s$/, ''));
    return refTokens.every(token => nameTokens.includes(token));
  });
  if (bySlug) return bySlug;

  return null;
}

function buildParams(action) {
  if (action.value && action.command === 'set_temperature') {
    return { value: action.value, unit: 'celsius' };
  }

  if (action.value && action.command === 'set_color') {
    return { hex: colorToHex(action.value) };
  }

  return {};
}

function colorToHex(color) {
  const map = {
    red: '#FF0000',
    blue: '#0000FF',
    green: '#00FF00',
    white: '#FFFFFF',
    yellow: '#FFD700',
    purple: '#800080',
    off: '#000000',
  };
  return map[String(color || '').toLowerCase()] || '#FFFFFF';
}

function generateSkillName(intent) {
  const type = intent.trigger_type || 'natural_language';
  if (type === 'natural_language') return `NL: ${(intent.entities?.raw || intent.raw_input || 'command').slice(0, 30)}`;
  if (type === 'webhook') return `Webhook: ${intent.trigger_source || 'webhook'} ${intent.trigger_event || ''}`.trim();
  if (type === 'time') return `Schedule: ${intent.trigger_value || intent.entities?.time || 'time'}`;
  if (type === 'health_event') return `Health: ${intent.trigger_event || 'event'}`;
  return 'Auto Skill';
}

function inferTags(intent) {
  const tags = [];
  if (intent.trigger_type) tags.push(intent.trigger_type);
  if (intent.trigger_source) tags.push(intent.trigger_source);
  if (intent.entities?.device_type) tags.push(intent.entities.device_type);
  return tags;
}

module.exports = { buildSkillFromIntent, buildSkillDraft, findDevice };
