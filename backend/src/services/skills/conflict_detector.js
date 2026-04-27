function detectConflict(newSkill, db) {
  const existingSkills = db.prepare(`
    SELECT * FROM skills WHERE is_active = 1
  `).all().map((skill) => ({
    ...skill,
    actions: JSON.parse(skill.actions || '[]'),
    trigger_extra: parseJson(skill.trigger_extra, {}),
  }));

  for (const existing of existingSkills) {
    if (!triggersOverlap(newSkill.trigger, existing)) continue;

    const contradiction = findActionContradiction(newSkill.actions || [], existing.actions || []);
    if (contradiction) {
      return {
        conflict_detected: true,
        new_skill_name: newSkill.name,
        conflicting_skill_id: existing.id,
        conflicting_skill_name: existing.name,
        conflict_type: 'contradictory_device_command',
        conflict_detail: contradiction,
        recommended_resolution: 'prioritise_new',
        resolution_options: [
          {
            id: 'prioritise_new',
            label: 'Keep new skill',
            consequence: `Deactivates "${existing.name}". Your new intent takes priority.`,
            recommended: true,
          },
          {
            id: 'prioritise_existing',
            label: 'Keep existing skill',
            consequence: `Discards the new skill. "${existing.name}" continues running unchanged.`,
            recommended: false,
          },
          {
            id: 'edit_new_before_saving',
            label: 'Edit before saving',
            consequence: 'Returns the new skill for you to adjust before it is saved.',
            recommended: false,
          },
        ],
      };
    }
  }

  return { conflict_detected: false };
}

function triggersOverlap(newTrigger = {}, existing) {
  if (newTrigger.type !== existing.trigger_type) return false;

  if (newTrigger.type === 'time') {
    const newMins = timeToMinutes(newTrigger.value);
    const existMins = timeToMinutes(existing.trigger_value);
    return Math.abs(newMins - existMins) <= 30;
  }

  if (newTrigger.type === 'natural_language') {
    return normalize(newTrigger.value) === normalize(existing.trigger_value);
  }

  if (newTrigger.type === 'webhook') {
    const extra = existing.trigger_extra || {};
    return existing.trigger_source === newTrigger.source && extra.event === newTrigger.event;
  }

  return false;
}

function findActionContradiction(newActions, existingActions) {
  for (const newAction of newActions) {
    for (const existingAction of existingActions) {
      if (newAction.device_id !== existingAction.device_id) continue;

      if (isContradictory(newAction, existingAction)) {
        const target = newAction.device_id || newAction.service || 'shared target';
        return `Both skills target "${target}": "${newAction.command}" vs "${existingAction.command}"`;
      }
    }
  }

  return null;
}

function isContradictory(a, b) {
  const contradictions = [
    ['turn_on', 'turn_off'],
    ['set_temperature', 'set_temperature'],
    ['set_color', 'set_color'],
  ];

  for (const [first, second] of contradictions) {
    const commandsMatch =
      (a.command === first && b.command === second) ||
      (a.command === second && b.command === first);

    if (!commandsMatch) continue;

    if (a.command === b.command) {
      return stableStringify(a.params || {}) !== stableStringify(b.params || {});
    }

    return true;
  }

  return false;
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = String(timeStr).split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function parseJson(value, fallback) {
  if (!value) return fallback;

  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch (_) {
    return fallback;
  }
}

function stableStringify(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }

  return JSON.stringify(
    Object.keys(value).sort().reduce((sorted, key) => {
      sorted[key] = value[key];
      return sorted;
    }, {})
  );
}

module.exports = { detectConflict };
