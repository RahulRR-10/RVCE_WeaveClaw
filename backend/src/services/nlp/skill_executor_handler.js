const { getDb } = require('../../db/db');
const { executeSkill } = require('../skills/skill_executor');
const { cosineSimilarity } = require('./rule_classifier');

const MATCH_THRESHOLD = 0.75;

async function handleExecuteExisting(userInput) {
  const db = getDb();
  const nlSkills = db.prepare(`
    SELECT * FROM skills WHERE trigger_type = 'natural_language' AND is_active = 1
  `).all();

  if (!nlSkills.length) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const skill of nlSkills) {
    const score = cosineSimilarity(userInput, skill.trigger_value);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = skill;
    }
  }

  if (bestScore >= MATCH_THRESHOLD && bestMatch) {
    const result = await executeSkill(bestMatch.id, 'user_input');
    return { type: 'skill_executed', skill_name: bestMatch.name, ...result };
  }

  return null;
}

async function handleSkillExecutionIntent(userInput) {
  return handleExecuteExisting(userInput);
}

module.exports = { handleExecuteExisting, handleSkillExecutionIntent };
