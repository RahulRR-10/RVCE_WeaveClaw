function ruleClassify(input, existingTriggers = []) {
  const raw = String(input || '').trim();
  const lower = raw.toLowerCase();

  const matchedTrigger = findTriggerMatch(raw, existingTriggers);
  if (matchedTrigger) {
    return {
      intent: 'execute_existing_skill',
      matched_trigger: matchedTrigger,
      confidence: 0.9,
    };
  }

  if (lower.includes('github') || lower.includes('push') || lower.includes('webhook')) {
    const repoMatch = raw.match(/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/);
    return {
      intent: 'create_skill',
      trigger_type: 'webhook',
      trigger_source: 'github',
      trigger_event: 'push',
      entities: { repo: repoMatch?.[1] || null, color: inferColor(lower), device_type: 'lights' },
      actions: [{ type: 'device_control', device: 'lights', command: 'set_color', value: inferColor(lower) || 'red' }],
      missing_entities: repoMatch ? [] : ['repo_name'],
      clarification_needed: !repoMatch,
      clarification_prompt: 'Which GitHub repository should I watch? (e.g. username/repo-name)',
    };
  }

  if (lower.includes('workout') || lower.includes('exercise') || lower.includes('health')) {
    return {
      intent: 'create_skill',
      trigger_type: 'health_event',
      trigger_source: 'samsung_health',
      trigger_event: lower.includes('start') ? 'workout_start' : 'workout_end',
      entities: { temperature: inferTemperature(lower) || 20 },
      actions: [{ type: 'device_control', device: 'ac', command: 'set_temperature', value: inferTemperature(lower) || 20 }],
      missing_entities: [],
      clarification_needed: false,
    };
  }

  const timeDetails = parseTimeIntent(lower);
  if (timeDetails) {
    return {
      intent: 'create_skill',
      trigger_type: 'time',
      trigger_source: 'schedule',
      trigger_value: timeDetails.time,
      trigger_extra: { recurrence: timeDetails.recurrence },
      entities: {
        raw,
        time: timeDetails.time,
        days: timeDetails.days,
        device_type: inferDevice(raw),
        command: inferCommand(lower),
      },
      actions: [{ type: 'device_control', device: inferDevice(raw), command: inferCommand(lower), value: inferActionValue(lower) }],
      missing_entities: [],
      clarification_needed: false,
    };
  }

  return {
    intent: 'create_skill',
    trigger_type: 'natural_language',
    trigger_source: 'user_input',
    trigger_value: raw,
    entities: { raw, device_type: inferDevice(raw), command: inferCommand(lower) },
    actions: [{ type: 'device_control', device: inferDevice(raw), command: inferCommand(lower), value: inferActionValue(lower) }],
    missing_entities: [],
    clarification_needed: false,
  };
}

function classifyRule(intentPayload) {
  return ruleClassify(intentPayload?.raw || intentPayload?.message || intentPayload || '');
}

function findTriggerMatch(input, existingTriggers) {
  const normalized = normalize(input);
  const exact = existingTriggers.find(trigger => normalize(trigger) === normalized);
  if (exact) return exact;

  let bestTrigger = null;
  let bestScore = 0;
  for (const trigger of existingTriggers) {
    const score = cosineSimilarity(input, trigger);
    if (score > bestScore) {
      bestScore = score;
      bestTrigger = trigger;
    }
  }

  return bestScore >= 0.75 ? bestTrigger : null;
}

function cosineSimilarity(a, b) {
  const wordsA = tokenize(a);
  const wordsB = tokenize(b);
  const allWords = [...new Set([...wordsA, ...wordsB])];
  const vecA = allWords.map(word => wordsA.filter(item => item === word).length);
  const vecB = allWords.map(word => wordsB.filter(item => item === word).length);
  const dot = vecA.reduce((sum, value, index) => sum + value * vecB[index], 0);
  const magA = Math.sqrt(vecA.reduce((sum, value) => sum + value * value, 0));
  const magB = Math.sqrt(vecB.reduce((sum, value) => sum + value * value, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

function parseTimeIntent(lower) {
  if (!(lower.includes(' at ') || lower.includes('every') || lower.includes('weekday') || lower.includes('daily'))) {
    return null;
  }

  const match = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3];
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;

  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const days = lower.includes('weekday') ? 'weekday' : lower.includes('daily') ? 'daily' : 'once';
  const recurrence = days === 'weekday'
    ? 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
    : days === 'daily'
      ? 'RRULE:FREQ=DAILY'
      : undefined;

  return { time, days, recurrence };
}

function inferCommand(lower) {
  if (lower.includes('turn on') || lower.includes('switch on')) return 'turn_on';
  if (lower.includes('turn off') || lower.includes('switch off') || lower.includes('sleep')) return 'turn_off';
  if (lower.includes('temperature') || lower.includes('cool') || lower.includes('heat') || /\b\d{2}\s*(c|degrees?)\b/.test(lower)) {
    return 'set_temperature';
  }
  if (inferColor(lower)) return 'set_color';
  return 'turn_off';
}

function inferDevice(input) {
  const lower = String(input || '').toLowerCase();
  if (lower.includes('kitchen') && lower.includes('light')) return 'kitchen lights';
  if (lower.includes('living') && lower.includes('light')) return 'living room lights';
  if (lower.includes('office') && lower.includes('light')) return 'office lights';
  if (lower.includes('bedroom') && (lower.includes('ac') || lower.includes('air'))) return 'bedroom ac';
  if (lower.includes('ac') || lower.includes('air conditioner') || lower.includes('room') || lower.includes('temperature') || lower.includes('cool')) return 'ac';
  if (lower.includes('light')) return 'lights';
  return 'device';
}

function inferActionValue(lower) {
  return inferTemperature(lower) || inferColor(lower) || undefined;
}

function inferTemperature(lower) {
  const match = lower.match(/\b(1[6-9]|2[0-9]|30)\s*(?:c|deg|degree|degrees)?\b/);
  return match ? Number(match[1]) : null;
}

function inferColor(lower) {
  const colors = ['red', 'blue', 'green', 'white', 'yellow', 'purple'];
  return colors.find(color => lower.includes(color)) || null;
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function tokenize(value) {
  return normalize(value).split(/\s+/).filter(Boolean);
}

module.exports = { ruleClassify, classifyRule, cosineSimilarity };
