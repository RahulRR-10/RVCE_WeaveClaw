const crypto = require('crypto');
const { getDb } = require('../../db/db');

const CONFIDENCE_THRESHOLD = parseFloat(process.env.SUGGESTION_CONFIDENCE_THRESHOLD || '0.70');

function scanPatterns() {
  const db = getDb();
  const created = [];

  const logs = db.prepare(`
    SELECT skill_id,
      strftime('%w', executed_at) as day_of_week,
      strftime('%H:%M', executed_at) as exec_time,
      executed_at
    FROM execution_logs
    WHERE triggered_by = 'user_input'
      AND status != 'failed'
      AND datetime(executed_at) > datetime('now', '-30 days')
    ORDER BY skill_id, executed_at
  `).all();

  const bySkill = new Map();
  for (const log of logs) {
    if (!bySkill.has(log.skill_id)) bySkill.set(log.skill_id, []);
    bySkill.get(log.skill_id).push(log);
  }

  for (const [skillId, skillLogs] of bySkill.entries()) {
    if (skillLogs.length < 5) continue;

    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(skillId);
    if (!skill || skill.trigger_type !== 'natural_language' || !skill.is_active) continue;

    const existingSuggestion = db.prepare(`
      SELECT id FROM suggestions
      WHERE skill_id = ? AND type = 'automate_pattern' AND status = 'pending'
    `).get(skillId);
    if (existingSuggestion) continue;

    const times = skillLogs.map((log) => timeToMinutes(log.exec_time)).filter((mins) => mins !== null);
    if (times.length < 5) continue;

    const mean = times.reduce((sum, mins) => sum + mins, 0) / times.length;
    const stdDev = Math.sqrt(
      times.reduce((sum, mins) => sum + Math.pow(mins - mean, 2), 0) / times.length
    );

    const dayGroups = {};
    for (const log of skillLogs) {
      dayGroups[log.day_of_week] = (dayGroups[log.day_of_week] || 0) + 1;
    }

    const confidence = calculateConfidence(skillLogs.length, stdDev);
    if (confidence < CONFIDENCE_THRESHOLD) continue;

    const avgTimeStr = minutesToTime(Math.round(mean));
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const observedDayIndexes = Object.keys(dayGroups).map(Number).sort((a, b) => a - b);
    const observedDays = observedDayIndexes.map((day) => dayNames[day]);
    const recurrence = buildRecurrence(observedDayIndexes);

    const suggestedSkill = {
      name: `${skill.name} (Scheduled)`,
      description: skill.description || '',
      trigger_type: 'time',
      trigger_value: avgTimeStr,
      trigger_source: 'schedule',
      trigger_extra: { recurrence },
      conditions: parseJson(skill.conditions, []),
      actions: parseJson(skill.actions, []),
    };

    const suggestionId = crypto.randomUUID();
    const evidence = {
      execution_count: skillLogs.length,
      days_observed: observedDayIndexes.length,
      avg_time: avgTimeStr,
      std_dev_minutes: Math.round(stdDev),
    };

    db.prepare(`
      INSERT INTO suggestions (
        id, skill_id, type, title, description, confidence_score, evidence_summary, suggested_skill
      )
      VALUES (?, ?, 'automate_pattern', ?, ?, ?, ?, ?)
    `).run(
      suggestionId,
      skillId,
      `Automate "${skill.name}"`,
      `You've triggered "${skill.name}" ${skillLogs.length} times, usually around ${avgTimeStr} on ${observedDays.join(', ') || 'various days'}. Want me to automate this?`,
      Number(confidence.toFixed(2)),
      JSON.stringify(evidence),
      JSON.stringify(suggestedSkill)
    );

    const result = {
      id: suggestionId,
      skill_id: skillId,
      title: `Automate "${skill.name}"`,
      confidence_score: Number(confidence.toFixed(2)),
    };
    created.push(result);
    console.log(`[HEARTBEAT] New suggestion created for skill: ${skill.name} (confidence: ${(confidence * 100).toFixed(0)}%)`);
  }

  return created;
}

function calculateConfidence(executionCount, stdDevMinutes) {
  const timeConsistencyScore = Math.max(0, 1 - stdDevMinutes / 60);
  const observationScore = Math.min(1, executionCount / 10);
  return timeConsistencyScore * 0.6 + observationScore * 0.4;
}

function buildRecurrence(dayIndexes) {
  const weekdayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const weekdays = [1, 2, 3, 4, 5];
  const hasWeekdayPattern = weekdays.every((day) => dayIndexes.includes(day));
  if (hasWeekdayPattern) return 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  if (dayIndexes.length === 0) return null;
  return `RRULE:FREQ=WEEKLY;BYDAY=${dayIndexes.map((day) => weekdayCodes[day]).join(',')}`;
}

function timeToMinutes(time) {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function minutesToTime(mins) {
  const hours = Math.floor(mins / 60) % 24;
  const minutes = mins % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (_err) {
    return fallback;
  }
}

module.exports = {
  scanPatterns,
  calculateConfidence,
  timeToMinutes,
  minutesToTime,
};
