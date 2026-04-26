function semanticValidate(skill) {
  return {
    valid: true,
    warnings: [],
    skill,
  };
}

module.exports = { semanticValidate };
