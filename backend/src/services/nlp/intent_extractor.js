const fs = require('fs');
const path = require('path');
const { ruleClassify } = require('./rule_classifier');

const PROMPT_TEMPLATE = fs.readFileSync(
  path.join(__dirname, 'intent_extraction.prompt.md'),
  'utf8'
);

const MAX_RETRIES = 3;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function extractIntent(userInput, existingTriggers = []) {
  const prompt = PROMPT_TEMPLATE
    .replace('{USER_INPUT}', userInput)
    .replace('{EXISTING_TRIGGERS}', JSON.stringify(existingTriggers));

  const model = process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();

  if (process.env.NLP_FORCE_RULES === 'true') {
    return ruleClassify(userInput, existingTriggers);
  }

  // Pre-screen: the rule classifier handles device_command and watcher
  // intents reliably via pattern matching. Skip Gemini for these — the LLM
  // doesn't know about these intent types and will misclassify them.
  const ruleResult = ruleClassify(userInput, existingTriggers);
  if (ruleResult && ['device_command', 'watcher', 'unparseable'].includes(ruleResult.intent)) {
    console.log(`[NLP] Rule classifier matched intent: ${ruleResult.intent} — skipping Gemini`);
    return ruleResult;
  }

  if (!apiKey) {
    console.warn('[NLP] GEMINI_API_KEY not set; falling back to rule classifier');
    return ruleResult || ruleClassify(userInput, existingTriggers);
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const systemNote = attempt > 1
        ? '\n\nCRITICAL: Your previous response could not be parsed as JSON. Respond with ONLY the raw JSON object. No prose, no markdown, no code fences.'
        : '';

      const response = await fetch(
        `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt + systemNote }] }],
            generationConfig: {
              temperature: attempt === 1 ? 0.1 : 0.0,
              responseMimeType: 'application/json',
            },
          }),
          signal: AbortSignal.timeout(20000),
        }
      );

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Gemini HTTP ${response.status}: ${errBody}`);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

      if (!text) {
        console.warn(`[NLP] Attempt ${attempt}/${MAX_RETRIES}: empty Gemini response`);
        continue;
      }

      const parsed = parseIntentJSON(text);
      if (parsed) return parsed;

      console.warn(`[NLP] Attempt ${attempt}/${MAX_RETRIES}: could not extract valid JSON from Gemini response`);
    } catch (err) {
      console.warn(`[NLP] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      break;
    }
  }

  console.warn('[NLP] All retries exhausted; falling back to rule classifier');
  return ruleClassify(userInput, existingTriggers);
}

function parseIntentJSON(text) {
  const stripped = String(text || '').replace(/```json?\n?/g, '').replace(/```/g, '').trim();

  try {
    const parsed = JSON.parse(stripped);
    if (isValidIntent(parsed)) return parsed;
  } catch {
    // Try extracting a JSON object below.
  }

  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (isValidIntent(parsed)) return parsed;
    } catch {
      // No valid JSON object found.
    }
  }

  return null;
}

function isValidIntent(obj) {
  return obj && typeof obj === 'object' &&
    ['create_skill', 'execute_existing_skill', 'clarification_needed', 'device_command', 'unparseable', 'watcher'].includes(obj.intent);
}

module.exports = { extractIntent, parseIntentJSON, isValidIntent };
