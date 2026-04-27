function semanticValidate(skillData, db) {
  const warnings = [];
  const errors = [];
  const devices = db.prepare('SELECT * FROM devices').all().map((device) => ({
    ...device,
    capabilities: JSON.parse(device.capabilities || '[]'),
  }));

  for (const action of skillData.actions || []) {
    if (action.device_id) {
      const device = devices.find((candidate) => (
        candidate.id === action.device_id || candidate.name === action.device_id
      ));

      if (!device) {
        warnings.push(`Device "${action.device_id}" is not registered in your environment. Add the device or switch to simulation mode.`);
      } else if (!device.capabilities.includes(action.command)) {
        errors.push(`Device "${device.name}" does not support command "${action.command}". Supported: ${device.capabilities.join(', ')}`);
      }
    }

    if (action.service === 'smartthings' && !process.env.SMARTTHINGS_TOKEN) {
      warnings.push('SmartThings is not configured (no token). This action will use simulation mode.');
    }
  }

  return { errors, warnings, valid: errors.length === 0 };
}

module.exports = { semanticValidate };
