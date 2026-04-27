function ruleClassify(input, existingTriggers = []) {
  const raw = String(input || '').trim();
  const lower = raw.toLowerCase();

  // Empty / garbled input
  if (!raw || raw.length < 2) {
    return {
      intent: 'unparseable',
      confidence: 0,
      clarification_needed: true,
      clarification_prompt: "I'm not sure what you want me to do. Can you give me a bit more detail?",
    };
  }

  const matchedTrigger = findTriggerMatch(raw, existingTriggers);
  if (matchedTrigger) {
    return {
      intent: 'execute_existing_skill',
      matched_trigger: matchedTrigger,
      confidence: 0.9,
    };
  }

  // ─── Emulator / App / Device commands ──────────────────────────
  // These must classify as device_command so chat.js auto-executes them.
  const emulatorActions = parseEmulatorIntent(raw, lower);
  if (emulatorActions) {
    return {
      intent: 'device_command',
      trigger_type: 'natural_language',
      trigger_source: 'user_input',
      trigger_value: raw,
      entities: { raw },
      actions: emulatorActions,
      missing_entities: [],
      clarification_needed: false,
    };
  }

  // ─── Watcher / background job intent (Phase 2) ─────────────────
  const watcherResult = parseWatcherIntent(raw, lower);
  if (watcherResult) {
    return watcherResult;
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

// ─── Emulator / App intent detection ─────────────────────────
// These patterns produce emulator_control actions.
// Supports compound commands: "X and Y", "X then Y"

function parseEmulatorIntent(raw, lower) {
  // ─── Try compound commands first ────────────────────────────
  // Split on " and ", " then ", " also ", " plus "
  // but only if both halves look like device commands
  const compoundSplit = lower.split(/\s+(?:and\s+(?:then\s+)?|then\s+|also\s+|plus\s+)/);
  if (compoundSplit.length > 1) {
    const allActions = [];
    for (const part of compoundSplit) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const subActions = parseSingleEmulatorCommand(raw, trimmed);
      if (subActions) {
        allActions.push(...subActions);
      }
    }
    if (allActions.length > 0) return allActions;
  }

  // ─── Single command ─────────────────────────────────────────
  return parseSingleEmulatorCommand(raw, lower);
}

function parseSingleEmulatorCommand(raw, lower) {
  // ─── Alarm ──────────────────────────────────────────────────
  // "set an alarm at 6am" / "set alarm for 6:30 am" / "wake me up at 7"
  const alarmMatch = lower.match(/(?:set\s+(?:an?\s+)?alarm\s+(?:at|for)\s+|wake\s+me\s+(?:up\s+)?(?:at|by)\s+)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (alarmMatch) {
    let hour = parseInt(alarmMatch[1], 10);
    const minute = parseInt(alarmMatch[2] || '0', 10);
    const meridiem = alarmMatch[3];
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    // Extract optional label
    const labelMatch = lower.match(/(?:called|named|labeled?|for)\s+"?([^"]+)"?$/);
    const message = labelMatch ? labelMatch[1].trim() : 'Alarm';
    return [{ type: 'emulator_control', command: 'set_alarm', params: { hour, minute, message } }];
  }

  // ─── Timer ──────────────────────────────────────────────────
  // "set a timer for 5 minutes" / "timer 30 seconds"
  const timerMatch = lower.match(/(?:set\s+(?:a\s+)?timer\s+(?:for\s+)?|timer\s+)(\d+)\s*(min|minute|minutes|sec|second|seconds|hour|hours|h|m|s)?/);
  if (timerMatch) {
    let seconds = parseInt(timerMatch[1], 10);
    const unit = (timerMatch[2] || 'min').toLowerCase();
    if (unit.startsWith('min') || unit === 'm') seconds *= 60;
    if (unit.startsWith('hour') || unit === 'h') seconds *= 3600;
    const labelMatch = lower.match(/(?:called|named|for)\s+"?([^"]+)"?$/);
    const message = labelMatch ? labelMatch[1].trim() : 'Timer';
    return [{ type: 'emulator_control', command: 'set_timer', params: { seconds, message } }];
  }

  // ─── Play music ─────────────────────────────────────────────
  // "play some relaxing music" / "play Bohemian Rhapsody" / "play music"
  const playMatch = lower.match(/play\s+(?:some\s+|me\s+)?(.+?)(?:\s+on\s+(spotify|youtube))?$/);
  if (playMatch) {
    const query = playMatch[1].trim();
    const app = playMatch[2] || null;
    // Avoid matching "play store" etc.
    if (!query.includes('store') && query !== 'back') {
      return [{ type: 'emulator_control', command: 'play_music', params: { query, app } }];
    }
  }

  // ─── Take photo / open camera ───────────────────────────────
  if (/(?:take\s+(?:a\s+)?(?:photo|picture|selfie|screenshot)|capture\s+(?:a\s+)?(?:photo|image))/.test(lower)) {
    if (lower.includes('screenshot') || lower.includes('screen')) {
      return [{ type: 'emulator_control', command: 'screenshot', params: {} }];
    }
    return [{ type: 'emulator_control', command: 'take_photo', params: {} }];
  }

  // ─── Call someone ───────────────────────────────────────────
  const callMatch = lower.match(/(?:call|dial|phone)\s+(.+)/);
  if (callMatch) {
    return [{ type: 'emulator_control', command: 'make_call', params: { target: callMatch[1].trim() } }];
  }

  // ─── Send a text / message ──────────────────────────────────
  const textMatch = lower.match(/(?:send\s+(?:a\s+)?(?:text|message|sms)\s+(?:to\s+)?(.+?)\s+(?:saying|with|that\s+says)\s+(.+))/);
  if (textMatch) {
    return [{ type: 'emulator_control', command: 'send_text', params: { to: textMatch[1].trim(), message: textMatch[2].trim() } }];
  }

  // ─── Volume controls ───────────────────────────────────────
  if (/(?:turn\s+(?:the\s+)?volume\s+up|volume\s+up|increase\s+volume|louder)/.test(lower)) {
    return [{ type: 'emulator_control', command: 'volume_up', params: {} }];
  }
  if (/(?:turn\s+(?:the\s+)?volume\s+down|volume\s+down|decrease\s+volume|quieter|softer)/.test(lower)) {
    return [{ type: 'emulator_control', command: 'volume_down', params: {} }];
  }
  if (/(?:mute|silence|unmute)/.test(lower)) {
    return [{ type: 'emulator_control', command: 'toggle_mute', params: {} }];
  }

  // ─── Brightness ─────────────────────────────────────────────
  const brightnessMatch = lower.match(/(?:set\s+)?brightness\s+(?:to\s+)?(\d+)(?:\s*%)?/);
  if (brightnessMatch) {
    return [{ type: 'emulator_control', command: 'set_brightness', params: { level: parseInt(brightnessMatch[1], 10) } }];
  }

  // ─── WiFi / Bluetooth toggles ───────────────────────────────
  if (/(?:turn\s+(?:on|off)\s+(?:the\s+)?wifi|wifi\s+(?:on|off)|toggle\s+wifi|enable\s+wifi|disable\s+wifi)/.test(lower)) {
    const on = lower.includes('on') || lower.includes('enable');
    return [{ type: 'emulator_control', command: 'toggle_wifi', params: { enable: on } }];
  }
  if (/(?:turn\s+(?:on|off)\s+(?:the\s+)?bluetooth|bluetooth\s+(?:on|off)|toggle\s+bluetooth)/.test(lower)) {
    const on = lower.includes('on') || lower.includes('enable');
    return [{ type: 'emulator_control', command: 'toggle_bluetooth', params: { enable: on } }];
  }

  // ─── Open Settings (specific panels) ────────────────────────
  // Must be before generic open_app to catch "open wifi settings"
  if (/(?:open|go\s+to)\s+(?:the\s+)?(?:\w+\s+)?settings?/.test(lower) && lower.includes('setting')) {
    let panel = null;
    if (lower.includes('wifi') || lower.includes('network')) panel = 'wifi';
    else if (lower.includes('bluetooth')) panel = 'bluetooth';
    else if (lower.includes('display') || lower.includes('screen')) panel = 'display';
    else if (lower.includes('sound') || lower.includes('audio')) panel = 'sound';
    else if (lower.includes('battery')) panel = 'battery';
    return [{ type: 'emulator_control', command: 'open_settings', params: { panel } }];
  }

  // ─── YouTube search ─────────────────────────────────────────
  const ytSearch = lower.match(/(?:open\s+youtube\s+(?:and\s+)?search\s+(?:for\s+)?|search\s+(?:on\s+)?youtube\s+(?:for\s+)?)(.+)/);
  if (ytSearch) {
    return [{ type: 'emulator_control', command: 'search_youtube', params: { query: ytSearch[1].trim() } }];
  }
  const ytSearch2 = lower.match(/search\s+(?:for\s+)?(.+?)\s+on\s+youtube/);
  if (ytSearch2) {
    return [{ type: 'emulator_control', command: 'search_youtube', params: { query: ytSearch2[1].trim() } }];
  }

  // ─── Google search ──────────────────────────────────────────
  const gSearch = lower.match(/(?:search\s+(?:on\s+)?google\s+(?:for\s+)?|google\s+)(.+)/);
  if (gSearch) {
    return [{ type: 'emulator_control', command: 'search_google', params: { query: gSearch[1].trim() } }];
  }
  const genericSearch = lower.match(/search\s+(?:for\s+)?(.+)/);
  if (genericSearch && !lower.includes('youtube')) {
    return [{ type: 'emulator_control', command: 'search_google', params: { query: genericSearch[1].trim() } }];
  }

  // ─── URL navigation ─────────────────────────────────────────
  const urlMatch = raw.match(/(?:go\s+to|open|visit|navigate\s+to)\s+(https?:\/\/\S+)/i);
  if (urlMatch) {
    return [{ type: 'emulator_control', command: 'open_url', params: { url: urlMatch[1] } }];
  }

  // ─── Open app (generic — must be LAST) ──────────────────────
  const appMatch = lower.match(/(?:open|launch|start|run|go\s+to)\s+(?:the\s+)?(.+?)(?:\s+app)?$/);
  if (appMatch) {
    const appName = appMatch[1].trim();
    if (!appName.startsWith('http') && appName !== 'settings') {
      return [{ type: 'emulator_control', command: 'open_app', params: { app: appName } }];
    }
  }

  // ─── Navigation keys ───────────────────────────────────────
  if (lower.includes('go home') || lower.includes('press home') || lower === 'home') {
    return [{ type: 'emulator_control', command: 'go_home', params: {} }];
  }
  if (lower.includes('go back') || lower.includes('press back') || lower === 'back') {
    return [{ type: 'emulator_control', command: 'go_back', params: {} }];
  }

  return null;
}

// ─── Watcher / background intent (Phase 2) ───────────────────
function parseWatcherIntent(raw, lower) {
  const watcherPatterns = [
    /notify\s+me\s+when\b/,
    /keep\s+an?\s+eye\s+on\b/,
    /alert\s+me\s+if\b/,
    /watch\s+my\b/,
  ];

  const isWatcher = watcherPatterns.some(pattern => pattern.test(lower));
  if (!isWatcher) return null;

  // Extract repo if present
  const repoMatch = raw.match(/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/);
  // Extract branch if present
  const branchMatch = lower.match(/(?:branch|on)\s+(\S+)/);

  const missing = [];
  if (!repoMatch) missing.push('repo');
  if (!branchMatch) missing.push('branch');
  missing.push('poll_interval');
  missing.push('notify_channel');

  const prompts = {
    repo: 'Which repo should I watch? Use owner/repo format, e.g. rahul/my-project.',
    branch: null, // set dynamically below
    poll_interval: 'How often should I check? Every minute, every 5 minutes, or something else?',
    notify_channel: 'How should I notify you — in-app or push notification?',
  };

  const firstMissing = missing[0];
  let prompt;
  if (firstMissing === 'branch') {
    const repo = repoMatch ? repoMatch[1] : 'the repo';
    prompt = `Which branch on ${repo}? I'll default to main unless you specify.`;
  } else {
    prompt = prompts[firstMissing] || "I'm not sure what you want me to do. Can you give me a bit more detail?";
  }

  return {
    intent: 'watcher',
    trigger_type: 'watcher',
    trigger_source: 'github',
    entities: {
      raw,
      repo: repoMatch ? repoMatch[1] : null,
      branch: branchMatch ? branchMatch[1] : null,
      poll_interval: null,
      notify_channel: null,
    },
    actions: [],
    missing_entities: missing,
    clarification_needed: true,
    clarification_prompt: prompt,
  };
}

module.exports = { ruleClassify, classifyRule, cosineSimilarity };
