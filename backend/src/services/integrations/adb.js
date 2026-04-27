/**
 * ADB Emulator Controller
 *
 * Executes real commands on the Android emulator via ADB.
 * Supports: opening URLs, launching apps, typing text,
 * tapping, pressing keys, and more.
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execFileAsync = promisify(execFile);

// ADB path — Android SDK platform-tools
const ADB_PATH = process.env.ADB_PATH
  || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools', 'adb.exe');

const DEVICE_ID = process.env.ADB_DEVICE || 'emulator-5554';

/**
 * Run a raw ADB shell command.
 */
async function adbShell(command) {
  console.log(`[ADB] shell: ${command}`);
  try {
    const { stdout, stderr } = await execFileAsync(ADB_PATH, [
      '-s', DEVICE_ID, 'shell', command
    ], { timeout: 15000, windowsHide: true });

    if (stderr && stderr.trim()) {
      console.log(`[ADB] stderr: ${stderr.trim()}`);
    }
    return stdout.trim();
  } catch (err) {
    console.error(`[ADB] Error: ${err.message}`);
    // Detect emulator-offline vs other ADB errors
    if (err.message.includes('not found') || err.message.includes('offline') ||
        err.message.includes('no devices') || err.message.includes('device not found') ||
        err.message.includes('ENOENT') || err.message.includes('cannot connect')) {
      const offlineErr = new Error('Emulator is offline or unreachable');
      offlineErr.code = 'EMULATOR_OFFLINE';
      throw offlineErr;
    }
    throw new Error(`ADB command failed: ${err.message}`);
  }
}

/**
 * Check if the emulator is reachable.
 * Returns true if the device responds to a basic ADB command.
 */
async function isEmulatorOnline() {
  try {
    const { stdout } = await execFileAsync(ADB_PATH, [
      '-s', DEVICE_ID, 'shell', 'echo', 'ping'
    ], { timeout: 5000, windowsHide: true });
    return stdout.trim().includes('ping');
  } catch {
    return false;
  }
}

/**
 * List all installed packages on the emulator.
 * Returns an array of package name strings (e.g. ['com.google.android.youtube', ...]).
 */
async function listPackages() {
  const output = await adbShell('pm list packages');
  return output
    .split('\n')
    .map(line => line.replace('package:', '').trim())
    .filter(Boolean);
}

/**
 * Resolve a user-friendly app name to a package on the device.
 * First checks KNOWN_APPS, then falls back to querying installed packages via ADB.
 *
 * Returns:
 *   { status: 'resolved', package: 'com.xxx' }
 *   { status: 'multiple', matches: ['com.x', 'com.y'] }
 *   { status: 'not_found', installed: ['com.a', 'com.b', ...] }
 */
async function resolvePackageFromDevice(appName) {
  const key = appName.toLowerCase().replace(/\s+/g, '');

  // 1. Check known-apps first
  if (KNOWN_APPS[key]) {
    return { status: 'resolved', package: KNOWN_APPS[key] };
  }

  // 2. Query installed packages on emulator
  let packages;
  try {
    packages = await listPackages();
  } catch (err) {
    if (err.code === 'EMULATOR_OFFLINE') throw err;
    throw err;
  }

  // 3. Fuzzy match: look for packages containing the app name
  const normalizedName = appName.toLowerCase().replace(/\s+/g, '');
  const matches = packages.filter(pkg => {
    const lowerPkg = pkg.toLowerCase();
    return lowerPkg.includes(normalizedName) ||
           lowerPkg.includes(normalizedName.replace(/\s/g, '.'));
  });

  if (matches.length === 1) {
    return { status: 'resolved', package: matches[0] };
  }

  if (matches.length > 1) {
    return { status: 'multiple', matches };
  }

  // 4. Not found — return installed list for clarification
  return { status: 'not_found', installed: packages };
}

/**
 * Open a URL on the emulator (opens in default browser or matching app).
 */
async function openUrl(url) {
  const result = await adbShell(
    `am start -a android.intent.action.VIEW -d "${url}"`
  );
  return { action: 'open_url', url, result };
}

/**
 * Launch an app by package name.
 */
async function openApp(packageName) {
  // Use monkey to launch (works for any package without knowing activity name)
  const result = await adbShell(
    `monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`
  );
  return { action: 'open_app', package: packageName, result };
}

/**
 * Type text into the currently focused input field.
 */
async function typeText(text) {
  // ADB input text needs spaces escaped
  const escaped = text.replace(/ /g, '%s').replace(/[&|;<>]/g, '');
  const result = await adbShell(`input text "${escaped}"`);
  return { action: 'type_text', text, result };
}

/**
 * Tap at screen coordinates.
 */
async function tap(x, y) {
  const result = await adbShell(`input tap ${x} ${y}`);
  return { action: 'tap', x, y, result };
}

/**
 * Press a key (e.g., KEYCODE_HOME, KEYCODE_BACK, KEYCODE_ENTER).
 */
async function pressKey(keycode) {
  const result = await adbShell(`input keyevent ${keycode}`);
  return { action: 'press_key', keycode, result };
}

/**
 * Go home.
 */
async function goHome() {
  return pressKey('KEYCODE_HOME');
}

/**
 * Press back.
 */
async function goBack() {
  return pressKey('KEYCODE_BACK');
}

/**
 * Open YouTube and search for a query.
 * Uses a direct YouTube search URL which opens the YouTube app.
 */
async function searchYouTube(query) {
  const encoded = encodeURIComponent(query);
  const url = `https://www.youtube.com/results?search_query=${encoded}`;
  const result = await openUrl(url);
  return { action: 'search_youtube', query, ...result };
}

/**
 * Open Google and search for a query.
 */
async function searchGoogle(query) {
  const encoded = encodeURIComponent(query);
  const url = `https://www.google.com/search?q=${encoded}`;
  const result = await openUrl(url);
  return { action: 'search_google', query, ...result };
}

/**
 * Take a screenshot and save to a local path.
 */
async function screenshot() {
  const remotePath = '/sdcard/screenshot.png';
  await adbShell(`screencap -p ${remotePath}`);
  return { action: 'screenshot', path: remotePath };
}

/**
 * Set an alarm using Android's SET_ALARM intent.
 * Works with Google Clock and most alarm apps.
 */
async function setAlarm(hour, minute = 0, message = 'Alarm') {
  const escaped = message.replace(/"/g, '\\"');
  const result = await adbShell(
    `am start -a android.intent.action.SET_ALARM ` +
    `--ei android.intent.extra.alarm.HOUR ${hour} ` +
    `--ei android.intent.extra.alarm.MINUTES ${minute} ` +
    `--es android.intent.extra.alarm.MESSAGE "${escaped}" ` +
    `--ez android.intent.extra.alarm.SKIP_UI true`
  );
  return { action: 'set_alarm', hour, minute, message, result };
}

/**
 * Set a countdown timer using Android's SET_TIMER intent.
 */
async function setTimer(seconds, message = 'Timer') {
  const escaped = message.replace(/"/g, '\\"');
  const result = await adbShell(
    `am start -a android.intent.action.SET_TIMER ` +
    `--ei android.intent.extra.alarm.LENGTH ${seconds} ` +
    `--es android.intent.extra.alarm.MESSAGE "${escaped}" ` +
    `--ez android.intent.extra.alarm.SKIP_UI true`
  );
  return { action: 'set_timer', seconds, message, result };
}

/**
 * Play music — tries YouTube Music search URL, falls back to YouTube.
 */
async function playMusic(query, app) {
  const encoded = encodeURIComponent(query);

  // If user explicitly says "on spotify", try Spotify URI
  if (app === 'spotify') {
    try {
      const result = await adbShell(
        `am start -a android.intent.action.VIEW -d "spotify:search:${encoded}"`
      );
      return { action: 'play_music', query, app: 'spotify', result };
    } catch {
      // Spotify not installed, fall through
    }
  }

  // Default: YouTube Music search URL (opens YT Music if installed, else browser)
  const url = `https://music.youtube.com/search?q=${encoded}`;
  const result = await openUrl(url);
  return { action: 'play_music', query, app: app || 'youtube_music', ...result };
}

/**
 * Take a photo — launches the camera capture intent.
 */
async function takePhoto() {
  const result = await adbShell(
    `am start -a android.media.action.IMAGE_CAPTURE`
  );
  return { action: 'take_photo', result };
}

/**
 * Dial a phone number (opens dialer, does not auto-call).
 */
async function makeCall(target) {
  // If target looks like a phone number, use tel: URI
  const cleaned = target.replace(/[^0-9+]/g, '');
  const uri = cleaned.length > 0 ? `tel:${cleaned}` : `tel:${encodeURIComponent(target)}`;
  const result = await adbShell(
    `am start -a android.intent.action.DIAL -d "${uri}"`
  );
  return { action: 'make_call', target, result };
}

/**
 * Send a text message (opens messaging app with pre-filled content).
 */
async function sendText(to, message) {
  const escapedMsg = message.replace(/"/g, '\\"');
  const result = await adbShell(
    `am start -a android.intent.action.SENDTO ` +
    `-d "sms:${to}" ` +
    `--es sms_body "${escapedMsg}"`
  );
  return { action: 'send_text', to, message, result };
}

/**
 * Toggle Do Not Disturb mode.
 * 0 = off, 1 = priority only, 2 = total silence, 3 = alarms only
 */
async function toggleDnd(enable) {
  const value = enable ? 2 : 0; // 2 = total silence, 0 = off
  const result = await adbShell(`settings put global zen_mode ${value}`);
  return { action: 'toggle_dnd', enable, result };
}

/**
 * Volume controls via media key events.
 */
async function volumeUp() {
  const result = await adbShell('input keyevent KEYCODE_VOLUME_UP');
  return { action: 'volume_up', result };
}

async function volumeDown() {
  const result = await adbShell('input keyevent KEYCODE_VOLUME_DOWN');
  return { action: 'volume_down', result };
}

async function toggleMute() {
  const result = await adbShell('input keyevent KEYCODE_VOLUME_MUTE');
  return { action: 'toggle_mute', result };
}

/**
 * Set screen brightness (0-255).
 */
async function setBrightness(level) {
  // Clamp to 0-255, convert from percentage if needed
  const value = level > 100 ? level : Math.round((level / 100) * 255);
  const clamped = Math.max(0, Math.min(255, value));
  // Disable auto-brightness first, then set manual level
  await adbShell('settings put system screen_brightness_mode 0');
  const result = await adbShell(`settings put system screen_brightness ${clamped}`);
  return { action: 'set_brightness', level: clamped, result };
}

/**
 * Toggle WiFi on/off.
 */
async function toggleWifi(enable) {
  const cmd = enable ? 'svc wifi enable' : 'svc wifi disable';
  const result = await adbShell(cmd);
  return { action: 'toggle_wifi', enable, result };
}

/**
 * Toggle Bluetooth on/off.
 */
async function toggleBluetooth(enable) {
  const action = enable
    ? 'am start -a android.bluetooth.adapter.action.REQUEST_ENABLE'
    : 'am start -a android.bluetooth.adapter.action.REQUEST_DISABLE';
  const result = await adbShell(action);
  return { action: 'toggle_bluetooth', enable, result };
}

/**
 * Open Settings — optionally a specific panel.
 */
async function openSettings(panel) {
  const PANELS = {
    wifi:      'android.settings.WIFI_SETTINGS',
    bluetooth: 'android.settings.BLUETOOTH_SETTINGS',
    display:   'android.settings.DISPLAY_SETTINGS',
    sound:     'android.settings.SOUND_SETTINGS',
    battery:   'android.settings.BATTERY_SAVER_SETTINGS',
  };

  const action = panel && PANELS[panel]
    ? `am start -a ${PANELS[panel]}`
    : `am start -a android.settings.SETTINGS`;

  const result = await adbShell(action);
  return { action: 'open_settings', panel, result };
}

// ─── Well-known Android packages ─────────────────────────────────
const KNOWN_APPS = {
  youtube:    'com.google.android.youtube',
  chrome:     'com.android.chrome',
  browser:    'com.android.chrome',
  maps:       'com.google.android.apps.maps',
  gmail:      'com.google.android.gm',
  settings:   'com.android.settings',
  camera:     'com.android.camera2',
  photos:     'com.google.android.apps.photos',
  play:       'com.android.vending',
  'play store': 'com.android.vending',
  clock:      'com.google.android.deskclock',
  calculator: 'com.google.android.calculator',
  calendar:   'com.google.android.calendar',
  messages:   'com.google.android.apps.messaging',
  phone:      'com.android.dialer',
  contacts:   'com.android.contacts',
  files:      'com.google.android.apps.nbu.files',
  spotify:    'com.spotify.music',
  twitter:    'com.twitter.android',
  instagram:  'com.instagram.android',
  whatsapp:   'com.whatsapp',
};

function resolvePackage(appName) {
  const key = appName.toLowerCase().replace(/\s+/g, '');
  return KNOWN_APPS[key] || null;
}

module.exports = {
  adbShell,
  openUrl,
  openApp,
  typeText,
  tap,
  pressKey,
  goHome,
  goBack,
  searchYouTube,
  searchGoogle,
  screenshot,
  setAlarm,
  setTimer,
  playMusic,
  takePhoto,
  makeCall,
  sendText,
  toggleDnd,
  volumeUp,
  volumeDown,
  toggleMute,
  setBrightness,
  toggleWifi,
  toggleBluetooth,
  openSettings,
  resolvePackage,
  isEmulatorOnline,
  listPackages,
  resolvePackageFromDevice,
  KNOWN_APPS,
};
