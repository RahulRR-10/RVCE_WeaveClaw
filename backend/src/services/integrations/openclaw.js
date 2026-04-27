/**
 * Local Device & Emulator Controller
 *
 * Routes actions to the right handler:
 * - Device commands (turn_on, turn_off, etc.) → update DB state
 * - Emulator commands (open_url, open_app, search, etc.) → ADB
 */

const { getDb } = require('../../db/db');
const adb = require('./adb');

/**
 * Execute an action locally — either device state or ADB emulator control.
 */
async function executeLocal(action) {
  const { command } = action;

  // Emulator / ADB commands
  if (isEmulatorCommand(command)) {
    return executeEmulatorAction(action);
  }

  // Device state commands (turn_on, turn_off, set_temperature, set_color, etc.)
  return executeDeviceAction(action);
}

// ─── Emulator Commands via ADB ──────────────────────────────────

function isEmulatorCommand(command) {
  return [
    'open_url', 'open_app', 'search', 'search_youtube', 'search_google',
    'type_text', 'tap', 'press_key', 'go_home', 'go_back', 'screenshot',
    'launch',
    // Phase 1.5: rich Android intents
    'set_alarm', 'set_timer', 'play_music', 'take_photo',
    'make_call', 'send_text', 'toggle_dnd',
    'volume_up', 'volume_down', 'toggle_mute',
    'set_brightness', 'toggle_wifi', 'toggle_bluetooth', 'open_settings',
  ].includes(command);
}

async function executeEmulatorAction(action) {
  const { command, params } = action;

  // ─── Emulator online check ──────────────────────────────────
  const online = await adb.isEmulatorOnline();
  if (!online) {
    const err = new Error("I can't reach the emulator right now. Is it running?");
    err.reason = 'emulator_offline';
    throw err;
  }

  try {
    let result;

    switch (command) {
      case 'open_url':
        result = await adb.openUrl(params?.url);
        break;

      case 'open_app':
      case 'launch': {
        // ─── App resolution guard ───────────────────────────
        if (params?.package) {
          result = await adb.openApp(params.package);
          break;
        }

        const appName = params?.app || '';
        const resolution = await adb.resolvePackageFromDevice(appName);

        if (resolution.status === 'resolved') {
          result = await adb.openApp(resolution.package);
          break;
        }

        if (resolution.status === 'multiple') {
          return {
            executed: false,
            clarification_needed: true,
            question: `I found a few apps matching '${appName}': ${resolution.matches.join(', ')}. Which one did you want?`,
            context: { command, app: appName, candidates: resolution.matches },
          };
        }

        // status === 'not_found'
        return {
          executed: false,
          clarification_needed: true,
          question: `I couldn't find an app called '${appName}' on the emulator. Did you mean one of these?\n${resolution.installed.slice(0, 15).join(', ')}\n...or type the exact package name.`,
          context: { command, app: appName },
        };
      }

      case 'search_youtube':
        result = await adb.searchYouTube(params?.query || params?.text || '');
        break;

      case 'search_google':
        result = await adb.searchGoogle(params?.query || params?.text || '');
        break;

      case 'search': {
        const target = (params?.app || params?.engine || 'google').toLowerCase();
        const query = params?.query || params?.text || '';
        if (target.includes('youtube') || target.includes('yt')) {
          result = await adb.searchYouTube(query);
        } else {
          result = await adb.searchGoogle(query);
        }
        break;
      }

      case 'type_text':
        result = await adb.typeText(params?.text || '');
        break;

      case 'tap':
        result = await adb.tap(params?.x || 0, params?.y || 0);
        break;

      case 'press_key':
        result = await adb.pressKey(params?.key || 'KEYCODE_ENTER');
        break;

      case 'go_home':
        result = await adb.goHome();
        break;

      case 'go_back':
        result = await adb.goBack();
        break;

      case 'screenshot':
        result = await adb.screenshot();
        break;

      // ─── Rich Android intents ─────────────────────────────
      case 'set_alarm':
        result = await adb.setAlarm(params?.hour || 6, params?.minute || 0, params?.message || 'Alarm');
        break;

      case 'set_timer':
        result = await adb.setTimer(params?.seconds || 60, params?.message || 'Timer');
        break;

      case 'play_music':
        result = await adb.playMusic(params?.query || 'music', params?.app);
        break;

      case 'take_photo':
        result = await adb.takePhoto();
        break;

      case 'make_call':
        result = await adb.makeCall(params?.target || '');
        break;

      case 'send_text':
        result = await adb.sendText(params?.to || '', params?.message || '');
        break;

      case 'toggle_dnd':
        result = await adb.toggleDnd(params?.enable !== false);
        break;

      case 'volume_up':
        result = await adb.volumeUp();
        break;

      case 'volume_down':
        result = await adb.volumeDown();
        break;

      case 'toggle_mute':
        result = await adb.toggleMute();
        break;

      case 'set_brightness':
        result = await adb.setBrightness(params?.level || 50);
        break;

      case 'toggle_wifi':
        result = await adb.toggleWifi(params?.enable !== false);
        break;

      case 'toggle_bluetooth':
        result = await adb.toggleBluetooth(params?.enable !== false);
        break;

      case 'open_settings':
        result = await adb.openSettings(params?.panel);
        break;

      default:
        return { executed: false, error: `Unknown emulator command: ${command}` };
    }

    const message = `✅ Emulator: ${command} executed`;
    console.log(`[EMULATOR] ${message}`);
    return { executed: true, message, ...result };

  } catch (err) {
    console.error(`[EMULATOR] ${command} failed: ${err.message}`);
    // Re-throw with structured info for the caller
    if (err.reason === 'emulator_offline' || err.code === 'EMULATOR_OFFLINE') {
      const offlineErr = new Error("I can't reach the emulator right now. Is it running?");
      offlineErr.reason = 'emulator_offline';
      throw offlineErr;
    }
    throw err;
  }
}

// ─── Device State Commands ──────────────────────────────────────

async function executeDeviceAction(action) {
  const { command, device_id, params } = action;
  const db = getDb();

  const device = device_id
    ? db.prepare('SELECT * FROM devices WHERE id = ?').get(device_id)
    : null;

  const deviceName = device ? device.name : (device_id || 'unknown device');

  // Validate capability
  if (device) {
    const capabilities = JSON.parse(device.capabilities || '[]');
    if (capabilities.length > 0 && !capabilities.includes(command)) {
      return {
        executed: false,
        error: `Device "${deviceName}" does not support "${command}". Supported: ${capabilities.join(', ')}`,
      };
    }
  }

  // Update device state in DB
  const stateUpdate = buildStateUpdate(command, params);
  if (device) {
    db.prepare('UPDATE devices SET is_online = ? WHERE id = ?')
      .run(stateUpdate.is_online, device.id);
  }

  const message = formatDeviceMessage(deviceName, command, params);
  console.log(`[DEVICE] ${message}`);

  return {
    executed: true,
    device_id,
    device_name: deviceName,
    command,
    params: params || {},
    message,
    state: stateUpdate,
  };
}

function buildStateUpdate(command, params) {
  switch (command) {
    case 'turn_on':  return { is_online: 1, power: 'on' };
    case 'turn_off': return { is_online: 0, power: 'off' };
    case 'set_temperature':
      return { is_online: 1, power: 'on', temperature: params?.value, unit: params?.unit || 'C' };
    case 'set_color':
      return { is_online: 1, power: 'on', color: params?.hex || params?.color };
    default:
      return { is_online: 1 };
  }
}

function formatDeviceMessage(name, command, params) {
  switch (command) {
    case 'turn_on':        return `✅ ${name} → TURNED ON`;
    case 'turn_off':       return `✅ ${name} → TURNED OFF`;
    case 'set_temperature': return `✅ ${name} → TEMPERATURE SET to ${params?.value}°${params?.unit || 'C'}`;
    case 'set_color':      return `✅ ${name} → COLOR SET to ${params?.hex || params?.color || 'white'}`;
    case 'notify':         return `✅ NOTIFICATION: "${params?.message || 'alert'}"`;
    case 'log':            return `✅ LOG: "${params?.message || 'executed'}"`;
    default:               return `✅ ${name} → ${command.toUpperCase()} executed`;
  }
}

module.exports = { executeLocal };
