require('dotenv').config();
const express = require('express');
const cors = require('cors');

const skillsRouter = require('./api/skills');
const devicesRouter = require('./api/devices');
const webhooksRouter = require('./api/webhooks');
const chatRouter = require('./api/chat');
const { startScheduler } = require('./services/skills/scheduler');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/skills', skillsRouter);
app.use('/devices', devicesRouter);
app.use('/webhooks', webhooksRouter);
app.use('/chat', chatRouter);

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`WeaveClaw backend running on port ${PORT}`);
    startScheduler();
  });
}

module.exports = app;  // for testing
