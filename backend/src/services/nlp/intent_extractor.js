async function extractIntent(text) {
  return {
    intent: "unknown",
    confidence: 0,
    raw: text || "",
  };
}

module.exports = { extractIntent };
