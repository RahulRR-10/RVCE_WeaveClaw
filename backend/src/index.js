require('dotenv').config();
const express = require('express');
const cors = require('cors');

const skillsRouter = require('./api/skills');
const devicesRouter = require('./api/devices');
const webhooksRouter = require('./api/webhooks');
const chatRouter = require('./api/chat');
const conflictsRouter = require('./api/conflicts');
const suggestionsRouter = require('./api/suggestions');
const { startScheduler } = require('./services/skills/scheduler');
const { scanPatterns } = require('./services/heartbeat/pattern_scanner');
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

function startHeartbeatSchedule() {
  const heartbeatMins = parseInt(process.env.HEARTBEAT_INTERVAL_MINUTES || '15', 10);
  const interval = Number.isFinite(heartbeatMins) && heartbeatMins > 0 ? heartbeatMins : 15;

  cron.schedule(`*/${interval} * * * *`, () => {
    console.log('[HEARTBEAT] Running pattern scan...');
    scanPatterns();
  });
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`WeaveClaw backend running on port ${PORT}`);
    startScheduler();
    startHeartbeatSchedule();
  });
}

module.exports = app;  // for testing
