async function simulateAction(action) {
  return {
    simulated: true,
    action,
  };
}

module.exports = { simulateAction };
