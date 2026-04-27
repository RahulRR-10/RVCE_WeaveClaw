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
    throw new Error(`ADB command failed: ${err.message}`);
  }
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
  resolvePackage,
  KNOWN_APPS,
};
