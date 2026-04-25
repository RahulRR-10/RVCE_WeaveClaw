require('dotenv').config();
const express = require('express');
const cors = require('cors');

const skillsRouter = require('./api/skills');
const devicesRouter = require('./api/devices');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/skills', skillsRouter);
app.use('/devices', devicesRouter);

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`WeaveClaw backend running on port ${PORT}`));

module.exports = app;  // for testing
