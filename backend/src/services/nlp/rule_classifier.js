function classifyRule(intentPayload) {
  return {
    classification: "unclassified",
    source: intentPayload || null,
  };
}

module.exports = { classifyRule };
