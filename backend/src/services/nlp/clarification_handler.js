const sessions = new Map();
const TTL_MS = 10 * 60 * 1000;

function storePartial(sessionId, intent) {
  sessions.set(sessionId, { intent, expiresAt: Date.now() + TTL_MS });
}

function getPartial(sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }

  entry.expiresAt = Date.now() + TTL_MS;
  return entry.intent;
}

function clearPartial(sessionId) {
  sessions.delete(sessionId);
}

/**
 * Watcher clarification prompts — keyed by missing entity name.
 * Some prompts are dynamic (need repo name), so they're functions.
 */
const WATCHER_PROMPTS = {
  repo: () => 'Which repo should I watch? Use owner/repo format, e.g. rahul/my-project.',
  branch: (entities) => `Which branch on ${entities?.repo || 'the repo'}? I'll default to main unless you specify.`,
  poll_interval: () => 'How often should I check? Every minute, every 5 minutes, or something else?',
  notify_channel: () => 'How should I notify you — in-app or push notification?',
};

function mergeEntity(partialIntent, entityKey, entityValue) {
  const merged = {
    ...partialIntent,
    entities: { ...(partialIntent.entities || {}) },
  };

  merged.entities[entityKey] = entityValue;
  if (entityKey === 'repo_name') merged.entities.repo = entityValue;

  // When user provides a package name in response to app_not_found clarification,
  // update the action params so execution can proceed.
  if (entityKey === 'app_package' && Array.isArray(merged.actions)) {
    merged.actions = merged.actions.map(action => {
      if (action.type === 'emulator_control' && (action.command === 'open_app' || action.command === 'launch')) {
        return {
          ...action,
          params: { ...action.params, app: entityValue, package: null },
        };
      }
      return action;
    });
  }

  // ─── Watcher entity parsing ─────────────────────────────────
  if (entityKey === 'repo' && entityValue) {
    // User might type "rahul/project" or just "my-project"
    merged.entities.repo = entityValue.trim();
  }

  if (entityKey === 'branch' && entityValue) {
    merged.entities.branch = entityValue.trim().toLowerCase();
  }

  if (entityKey === 'poll_interval' && entityValue) {
    merged.entities.poll_interval = parsePollInterval(entityValue);
  }

  if (entityKey === 'notify_channel' && entityValue) {
    merged.entities.notify_channel = parseNotifyChannel(entityValue);
  }

  // Remove filled entity from missing list
  if (Array.isArray(merged.missing_entities)) {
    merged.missing_entities = merged.missing_entities.filter(entity => entity !== entityKey);
  }

  // ─── Watcher: check if all params resolved → need confirmation ──
  if (merged.intent === 'watcher' && merged.missing_entities?.length === 0) {
    // All 4 params collected — now need confirmation
    if (!merged._awaiting_confirmation) {
      merged._awaiting_confirmation = true;
      merged.clarification_needed = true;

      const repo = merged.entities.repo || '?';
      const branch = merged.entities.branch || 'main';
      const interval = formatInterval(merged.entities.poll_interval);
      const channel = merged.entities.notify_channel || 'in-app';

      merged.clarification_prompt = `I'll watch ${repo} on ${branch} every ${interval} and notify you ${channel}. Does that sound right?`;
      merged.missing_entities = ['confirmation'];
      return merged;
    }
  }

  // ─── Watcher confirmation handling ──────────────────────────
  if (entityKey === 'confirmation') {
    const answer = entityValue.trim().toLowerCase();
    const isYes = ['yes', 'y', 'yeah', 'yep', 'sure', 'ok', 'go ahead', 'correct', 'right', 'do it', 'sounds good', 'absolutely'].some(
      word => answer.includes(word)
    );

    if (isYes) {
      merged._confirmed = true;
      merged.clarification_needed = false;
      merged.missing_entities = [];
    } else {
      // User said no or corrected something — re-ask
      merged._awaiting_confirmation = false;
      merged.clarification_needed = true;
      merged.clarification_prompt = "OK, what would you like to change? You can tell me the repo, branch, polling interval, or notification channel.";
      merged.missing_entities = ['correction'];
    }
    return merged;
  }

  // ─── Handle a correction after user said "no" to confirmation ──
  if (entityKey === 'correction') {
    // Try to figure out what they corrected
    const val = entityValue.trim();
    if (val.includes('/')) {
      merged.entities.repo = val;
    } else if (['push', 'in-app', 'in_app'].includes(val.toLowerCase())) {
      merged.entities.notify_channel = parseNotifyChannel(val);
    } else if (parsePollInterval(val)) {
      merged.entities.poll_interval = parsePollInterval(val);
    } else {
      merged.entities.branch = val.toLowerCase();
    }

    // Re-confirm
    merged._awaiting_confirmation = false;
    merged.missing_entities = [];
    merged.clarification_needed = false;
    // mergeEntity will be called again via the regular loop, which will trigger confirmation
    return merged;
  }

  // ─── Set next prompt for remaining watcher entities ─────────
  if (merged.intent === 'watcher' && merged.missing_entities?.length > 0) {
    const nextMissing = merged.missing_entities[0];
    const promptFn = WATCHER_PROMPTS[nextMissing];
    if (promptFn) {
      merged.clarification_prompt = typeof promptFn === 'function' ? promptFn(merged.entities) : promptFn;
    }
    merged.clarification_needed = true;
  } else {
    merged.clarification_needed = (merged.missing_entities?.length || 0) > 0;
  }

  return merged;
}

/**
 * Parse a human-readable poll interval into seconds.
 */
function parsePollInterval(input) {
  const lower = String(input || '').toLowerCase().trim();

  // "every 5 minutes" / "5 minutes" / "5m" / "5 min"
  const minMatch = lower.match(/(\d+)\s*(?:min|minute|minutes|m)\b/);
  if (minMatch) return parseInt(minMatch[1], 10) * 60;

  // "every minute" / "1 minute"
  if (lower.includes('every minute') || lower === 'minute' || lower === '1 minute') return 60;

  // "every 30 seconds" / "30s"
  const secMatch = lower.match(/(\d+)\s*(?:sec|second|seconds|s)\b/);
  if (secMatch) return Math.max(parseInt(secMatch[1], 10), 30); // min 30s

  // "every hour" / "1 hour"
  const hrMatch = lower.match(/(\d+)\s*(?:hr|hour|hours|h)\b/);
  if (hrMatch) return parseInt(hrMatch[1], 10) * 3600;
  if (lower.includes('hour')) return 3600;

  // Just a number — treat as minutes
  const justNum = lower.match(/^(\d+)$/);
  if (justNum) return parseInt(justNum[1], 10) * 60;

  return 60; // default 1 minute
}

/**
 * Parse a human-readable notification channel.
 */
function parseNotifyChannel(input) {
  const lower = String(input || '').toLowerCase().trim();
  if (lower.includes('push')) return 'push';
  return 'in_app';
}

/**
 * Format seconds into a human-readable interval string.
 */
function formatInterval(seconds) {
  if (!seconds) return '1 minute';
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds === 60) return '1 minute';
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds === 3600) return '1 hour';
  return `${Math.round(seconds / 3600)} hours`;
}

function buildClarificationQuestion() {
  return 'Could you clarify what you want this skill to do?';
}

module.exports = {
  storePartial,
  getPartial,
  clearPartial,
  mergeEntity,
  buildClarificationQuestion,
  parsePollInterval,
  parseNotifyChannel,
  formatInterval,
};
