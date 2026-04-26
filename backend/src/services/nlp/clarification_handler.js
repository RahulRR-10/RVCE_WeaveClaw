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

function mergeEntity(partialIntent, entityKey, entityValue) {
  const merged = {
    ...partialIntent,
    entities: { ...(partialIntent.entities || {}) },
  };

  merged.entities[entityKey] = entityValue;
  if (entityKey === 'repo_name') merged.entities.repo = entityValue;

  if (Array.isArray(merged.missing_entities)) {
    merged.missing_entities = merged.missing_entities.filter(entity => entity !== entityKey);
  }

  merged.clarification_needed = (merged.missing_entities?.length || 0) > 0;
  return merged;
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
};
