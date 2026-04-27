require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');

const skillsRouter = require('./api/skills');
const devicesRouter = require('./api/devices');
const webhooksRouter = require('./api/webhooks');
const chatRouter = require('./api/chat');
const conflictsRouter = require('./api/conflicts');
const suggestionsRouter = require('./api/suggestions');
const watchersRouter = require('./api/watchers');
const { startScheduler } = require('./services/skills/scheduler');
const { scanPatterns } = require('./services/heartbeat/pattern_scanner');
const { startWatcherRunner } = require('./services/watchers/watcher_runner');
const { registerWsClient } = require('./services/notifications/notify');
const cron = require('node-cron');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/skills', skillsRouter);
app.use('/devices', devicesRouter);
app.use('/webhooks', webhooksRouter);
app.use('/chat', chatRouter);
app.use('/conflicts', conflictsRouter);
app.use('/suggestions', suggestionsRouter);
app.use('/watchers', watchersRouter);

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.post('/heartbeat/scan', (req, res) => {
  try {
    const suggestions_created = scanPatterns();
    res.json({
      message: 'Pattern scan complete',
      suggestions_created,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Global error handler - avoid exposing stack traces in production.
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({
    error: 'Something went wrong. Please try again.',
    ...(process.env.NODE_ENV === 'development' && { detail: err.message }),
  });
});

// Unknown route handler.
app.use((req, res) => {
  res.status(404).json({ error: `Endpoint ${req.method} ${req.path} not found` });
});

function startHeartbeatSchedule() {
  const heartbeatMins = parseInt(process.env.HEARTBEAT_INTERVAL_MINUTES || '15', 10);
  const interval = Number.isFinite(heartbeatMins) && heartbeatMins > 0 ? heartbeatMins : 15;

  cron.schedule(`*/${interval} * * * *`, () => {
    console.log('[HEARTBEAT] Running pattern scan...');
    scanPatterns();
  });
}

// ─── WebSocket upgrade for real-time notifications ──────────────
function setupWebSocket(server) {
  // Use raw ws upgrade without requiring the ws package —
  // we accept the upgrade manually and pipe through our registration.
  let WebSocketServer;
  try {
    WebSocketServer = require('ws').Server;
  } catch {
    console.warn('[WS] ws package not installed — WebSocket notifications disabled. Install with: npm i ws');
    return;
  }

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // userId can be passed as query param: /ws?userId=abc
    const url = new URL(req.url, 'http://localhost');
    const userId = url.searchParams.get('userId') || 'default';

    registerWsClient(userId, ws);
    console.log(`[WS] Client connected: ${userId}`);

    ws.send(JSON.stringify({ type: 'connected', userId }));
  });

  console.log('[WS] WebSocket server ready on /ws');
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const server = http.createServer(app);

  setupWebSocket(server);

  server.listen(PORT, () => {
    console.log(`WeaveClaw backend running on port ${PORT}`);
    startScheduler();
    startHeartbeatSchedule();
    startWatcherRunner();
  });
}

module.exports = app;  // for testing
