async function executeSmartThings(action) {
  const token = process.env.SMARTTHINGS_TOKEN;
  if (!token || process.env.SIMULATION_MODE === 'true') {
    throw new Error('SmartThings not configured - use simulation mode');
  }

  const url = `https://api.smartthings.com/v1/devices/${action.device_id}/commands`;
  const body = {
    commands: [{
      component: 'main',
      capability: mapCapability(action.command),
      command: mapCommand(action.command),
      arguments: Object.values(action.params || {}),
    }],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`SmartThings API error: ${res.status}${detail ? ` ${detail}` : ''}`);
  }

  return await res.json();
}

function mapCapability(command) {
  const map = {
    turn_on: 'switch',
    turn_off: 'switch',
    set_temperature: 'thermostatCoolingSetpoint',
    set_color: 'colorControl',
  };
  return map[command] || 'switch';
}

function mapCommand(command) {
  const map = {
    turn_on: 'on',
    turn_off: 'off',
    set_temperature: 'setCoolingSetpoint',
    set_color: 'setColor',
  };
  return map[command] || command;
}

module.exports = { executeSmartThings, mapCapability, mapCommand };
