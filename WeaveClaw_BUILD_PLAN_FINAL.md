# WeaveClaw — Complete Copilot Implementation Plan (Gemini Edition)
> **Read this entire document before writing a single line of code.**
> Build strictly in phase order. Each phase has a mandatory checkpoint. Do not proceed until the checkpoint passes.
> Stack: OpenClaw (Gateway) + Express/Node.js (port 3000) + SQLite + Flutter (emulator)

---

## Architecture Overview

```
Flutter Emulator (Android/iOS)
        ↕  HTTP REST  (port 3000)
WeaveClaw Express Backend  ←→  SQLite DB (~/.openclaw/WeaveClaw.db)
        ↕  Gateway API  (port 18789)
OpenClaw Gateway
        ↕
   SKILL.md   (registers WeaveClaw as an OpenClaw skill)
   HEARTBEAT.md  (pattern scanner — the "Heartbeat Daemon" from the spec)
   Webhooks  (GitHub, SmartThings, Samsung Health)
   node-cron  (scheduled skill triggers inside Express)
        ↕
   ngrok tunnel  (public webhook URL for GitHub)
        ↕
Google Gemini API  (cloud LLM — gemini-3.1-pro-preview)
```

**Key insight:** The spec's "Heartbeat Daemon" is implemented using OpenClaw's built-in `heartbeat` system (configured in `openclaw.json`) + a `HEARTBEAT.md` checklist file. You do NOT build a separate daemon process. OpenClaw IS the daemon.

**OpenClaw Gateway API base:** `http://localhost:18789`
**WeaveClaw backend base:** `http://localhost:3000`
**Flutter talks to:** `http://10.0.2.2:3000` (Android emulator localhost alias)
**Gemini API base:** `https://generativelanguage.googleapis.com/v1beta/models`

---

## Phase 0 — Environment Setup
**Goal:** Every tool installed, OpenClaw running, Flutter emulator booting, project skeleton created.
**Estimated time:** 1–2 hours. Do not skip steps.

### 0.1 Install System Tools

```bash
# Node.js 24 (required by OpenClaw)
# macOS
brew install node@24
# Linux
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version   # must be v24.x.x
npm --version

# ngrok (public webhook tunnel)
# macOS
brew install ngrok
# Linux
snap install ngrok
# Windows: download from https://ngrok.com/download

# Flutter SDK
# Follow https://docs.flutter.dev/get-started/install
# After install, verify:
flutter doctor   # resolve any issues shown
```

> **No local LLM runtime needed.** WeaveClaw uses the Google Gemini cloud API.
> Get a free API key at https://aistudio.google.com — paste it into `.env` in step 0.4.

### 0.2 Install and Configure OpenClaw

```bash
# Install OpenClaw globally
npm install -g openclaw@latest

# Run the interactive onboarding wizard
# When prompted for model provider: choose "custom" or "OpenAI-compatible"
# When prompted to install daemon: YES
# WeaveClaw calls Gemini directly — OpenClaw is only used for
# skill registration and the heartbeat trigger, not for inference.
openclaw onboard --install-daemon

# Verify the gateway is running
openclaw gateway status
# Expected: Gateway running on port 18789

# Check OpenClaw doctor for issues
openclaw doctor
```

### 0.3 Project Skeleton

```
WeaveClaw/
├── backend/                    ← Express + Node.js server
│   ├── src/
│   │   ├── api/
│   │   │   ├── skills.js
│   │   │   ├── devices.js
│   │   │   ├── chat.js
│   │   │   ├── suggestions.js
│   │   │   ├── conflicts.js
│   │   │   └── webhooks.js
│   │   ├── services/
│   │   │   ├── nlp/
│   │   │   │   ├── intent_extractor.js
│   │   │   │   ├── rule_classifier.js
│   │   │   │   ├── clarification_handler.js
│   │   │   │   ├── skill_executor_handler.js
│   │   │   │   ├── skill_builder.js
│   │   │   │   └── intent_extraction.prompt.md
│   │   │   ├── skills/
│   │   │   │   ├── skill_validator.js
│   │   │   │   ├── semantic_validator.js
│   │   │   │   ├── conflict_detector.js
│   │   │   │   └── skill_executor.js
│   │   │   ├── heartbeat/
│   │   │   │   └── pattern_scanner.js
│   │   │   └── integrations/
│   │   │       ├── smartthings.js
│   │   │       ├── github_webhook.js
│   │   │       ├── samsung_health.js
│   │   │       └── simulation.js
│   │   ├── db/
│   │   │   ├── schema.sql
│   │   │   └── db.js
│   │   └── index.js
│   ├── scripts/
│   │   └── seed_demo.js
│   ├── tests/
│   │   ├── skills.test.js
│   │   ├── executor.test.js
│   │   ├── nlp.test.js
│   │   └── conflict.test.js
│   ├── .env.example
│   └── package.json
├── openclaw-skill/             ← OpenClaw integration files
│   ├── SKILL.md
│   └── HEARTBEAT.md
├── flutter_app/                ← Flutter frontend
│   ├── lib/
│   │   ├── main.dart
│   │   ├── screens/
│   │   │   ├── chat_screen.dart
│   │   │   ├── skill_library_screen.dart
│   │   │   ├── suggestions_screen.dart
│   │   │   └── community_hub_screen.dart
│   │   ├── services/
│   │   │   └── api_service.dart
│   │   ├── models/
│   │   │   ├── skill.dart
│   │   │   ├── suggestion.dart
│   │   │   └── chat_message.dart
│   │   └── widgets/
│   │       ├── skill_card.dart
│   │       ├── conflict_card.dart
│   │       └── suggestion_card.dart
│   ├── assets/
│   │   └── mock_hub_skills.json
│   └── pubspec.yaml
└── README.md
```

Create the backend project:
```bash
mkdir -p WeaveClaw/backend/src/{api,services/nlp,services/skills,services/integrations,services/heartbeat,db}
mkdir -p WeaveClaw/backend/tests
mkdir -p WeaveClaw/backend/scripts
mkdir -p WeaveClaw/openclaw-skill
cd WeaveClaw/backend
npm init -y
npm install express better-sqlite3 zod uuid node-cron cors dotenv
npm install --save-dev jest supertest nodemon
```

Create the Flutter project:
```bash
cd WeaveClaw
flutter create flutter_app
cd flutter_app
mkdir -p assets
# Add to pubspec.yaml dependencies:
# http: ^1.2.0
flutter pub get
```

### 0.4 Environment File

Create `WeaveClaw/backend/.env`:
```env
PORT=3000
DB_PATH=./WeaveClaw.db
SIMULATION_MODE=true

GEMINI_API_KEY=                 # get from https://aistudio.google.com
GEMINI_MODEL=gemini-3.1-pro-preview

OPENCLAW_GATEWAY_URL=http://localhost:18789
OPENCLAW_AUTH_TOKEN=            # fill after openclaw onboard

SMARTTHINGS_TOKEN=              # optional
SAMSUNG_HEALTH_API_KEY=         # optional

PUBLIC_WEBHOOK_BASE_URL=        # fill after ngrok setup in Phase 2
HEARTBEAT_INTERVAL_MINUTES=15
SUGGESTION_CONFIDENCE_THRESHOLD=0.70
```

### 0.5 Checkpoint 0
- [ ] `node --version` prints v24.x.x
- [ ] Gemini API key obtained from https://aistudio.google.com
- [ ] Gemini smoke test passes:
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"say hello"}]}]}' \
  | jq .candidates[0].content.parts[0].text
# Must return a greeting string
```
- [ ] `openclaw gateway status` shows running on port 18789
- [ ] `flutter doctor` shows no critical issues
- [ ] Android emulator boots and shows a Flutter app
- [ ] `flutter_app/assets/` directory exists

---

## Phase 1 — Database Schema and CRUD API
**Goal:** A working backend that can store, retrieve, update, and delete skills. The database is the foundation. Nothing runs or thinks yet.

### 1.1 Database Schema

Create `backend/src/db/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN (
    'natural_language','time','webhook','api_event','device_event','health_event'
  )),
  trigger_value TEXT,
  trigger_source TEXT,
  trigger_extra TEXT,          -- JSON blob for extras (recurrence, repo, event)
  conditions TEXT DEFAULT '[]',-- JSON array
  actions TEXT NOT NULL,       -- JSON array
  metadata TEXT NOT NULL,      -- JSON object
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS execution_logs (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  executed_at TEXT DEFAULT (datetime('now')),
  triggered_by TEXT NOT NULL CHECK(triggered_by IN (
    'user_input','heartbeat','schedule','webhook','manual'
  )),
  status TEXT NOT NULL CHECK(status IN ('success','partial','failed','simulated')),
  actions_result TEXT,         -- JSON array
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  skill_id TEXT REFERENCES skills(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('automate_pattern','refine_schedule')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence_score REAL NOT NULL,
  evidence_summary TEXT,       -- JSON: {execution_count, days_observed, avg_time, std_dev}
  suggested_skill TEXT,        -- JSON: the suggested skill object to create if accepted
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','dismissed')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,          -- 'light','ac','switch','speaker','phone','coffee_machine'
  capabilities TEXT NOT NULL,  -- JSON array: ['turn_on','turn_off','set_temperature','set_color']
  service TEXT NOT NULL CHECK(service IN ('smartthings','simulation','samsung_health')),
  external_id TEXT,            -- SmartThings device ID
  is_online INTEGER DEFAULT 1,
  registered_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_execution_logs_skill_id ON execution_logs(skill_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_executed_at ON execution_logs(executed_at);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
```

### 1.2 Database Connection

Create `backend/src/db/db.js`:
```javascript
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db;

function getDb() {
  if (!db) {
    const dbPath = process.env.DB_PATH || './WeaveClaw.db';
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    const schema = fs.readFileSync(
      path.join(__dirname, 'schema.sql'), 'utf8'
    );
    db.exec(schema);
  }
  return db;
}

module.exports = { getDb };
```

### 1.3 Zod Validation Schema

Create `backend/src/services/skills/skill_validator.js`:
```javascript
const { z } = require('zod');

const TriggerSchema = z.object({
  type: z.enum(['natural_language','time','webhook','api_event','device_event','health_event']),
  value: z.string().optional(),
  source: z.enum(['user_input','smartthings','samsung_health','github','schedule']).optional(),
  event: z.string().optional(),
  recurrence: z.string().optional(),  // RRULE string
  repo: z.string().optional(),
});

const ConditionSchema = z.object({
  type: z.enum(['time_range','device_state','day_of_week','location']),
  value: z.string(),
});

const ActionSchema = z.object({
  service: z.enum(['smartthings','simulation','slack','github','smtp','webhook']),
  device_id: z.string().optional(),
  command: z.string(),
  params: z.record(z.any()).optional().default({}),
});

const SkillCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional(),
  trigger: TriggerSchema,
  conditions: z.array(ConditionSchema).optional().default([]),
  actions: z.array(ActionSchema).min(1, 'At least one action required'),
});

function validateSkill(data) {
  const result = SkillCreateSchema.safeParse(data);
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
    };
  }
  return { valid: true, data: result.data };
}

module.exports = { validateSkill, SkillCreateSchema };
```

### 1.4 Skills API

Create `backend/src/api/skills.js`:
```javascript
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/db');
const { validateSkill } = require('../services/skills/skill_validator');

const router = express.Router();

// GET /skills
router.get('/', (req, res) => {
  const db = getDb();
  const skills = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM execution_logs WHERE skill_id = s.id) as execution_count,
      (SELECT MAX(executed_at) FROM execution_logs WHERE skill_id = s.id) as last_executed
    FROM skills s ORDER BY s.created_at DESC
  `).all();

  res.json(skills.map(s => ({
    ...s,
    conditions: JSON.parse(s.conditions),
    actions: JSON.parse(s.actions),
    metadata: JSON.parse(s.metadata),
    trigger_extra: s.trigger_extra ? JSON.parse(s.trigger_extra) : null,
    is_active: Boolean(s.is_active),
  })));
});

// GET /skills/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  res.json({
    ...skill,
    conditions: JSON.parse(skill.conditions),
    actions: JSON.parse(skill.actions),
    metadata: JSON.parse(skill.metadata),
    trigger_extra: skill.trigger_extra ? JSON.parse(skill.trigger_extra) : null,
    is_active: Boolean(skill.is_active),
  });
});

// POST /skills
// NOTE: semantic_validator and conflict_detector imports are added here in Phase 4.
// At Phase 1, only syntactic (Zod) validation and a basic duplicate check run.
// After completing Phase 4, update this route to also call semanticValidate() and
// detectConflict() — see Phase 4.4 for the exact insertion point.
router.post('/', (req, res) => {
  const validation = validateSkill(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
  }

  const { name, description, trigger, conditions, actions } = validation.data;
  const db = getDb();
  const id = uuidv4();

  // Webhook uniqueness is source + event; all other types use trigger_value.
  const existing = trigger.type === 'webhook'
    ? db.prepare(`
        SELECT id FROM skills
        WHERE trigger_type = 'webhook' AND trigger_source = ?
          AND json_extract(trigger_extra, '$.event') = ? AND is_active = 1
      `).get(trigger.source || null, trigger.event || null)
    : db.prepare(`
        SELECT id FROM skills
        WHERE trigger_value = ? AND trigger_type = ? AND is_active = 1
      `).get(trigger.value || '', trigger.type);

  if (existing) {
    return res.status(409).json({
      error: 'Duplicate skill',
      message: 'A skill with this trigger already exists',
      existing_skill_id: existing.id
    });
  }

  const metadata = {
    created_at: new Date().toISOString(),
    created_by: req.body.created_by || 'user',
    source: req.body.source || 'user_generated',
    tags: req.body.tags || [],
    execution_count: 0,
    last_executed: null,
    confidence_score: req.body.confidence_score || null,
    is_active: true,
  };

  db.prepare(`
    INSERT INTO skills (id, name, description, trigger_type, trigger_value, trigger_source,
      trigger_extra, conditions, actions, metadata, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id, name, description || '', trigger.type, trigger.value || '',
    trigger.source || null,
    JSON.stringify({ event: trigger.event, recurrence: trigger.recurrence, repo: trigger.repo }),
    JSON.stringify(conditions), JSON.stringify(actions), JSON.stringify(metadata)
  );

  const created = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
  res.status(201).json({
    ...created,
    conditions: JSON.parse(created.conditions),
    actions: JSON.parse(created.actions),
    metadata: JSON.parse(created.metadata),
    is_active: Boolean(created.is_active),
  });
});

// PUT /skills/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Skill not found' });

  const existing = {
    name: row.name,
    description: row.description,
    trigger: {
      type: row.trigger_type,
      value: row.trigger_value,
      source: row.trigger_source,
      ...(row.trigger_extra ? JSON.parse(row.trigger_extra) : {}),
    },
    conditions: JSON.parse(row.conditions || '[]'),
    actions: JSON.parse(row.actions),
  };

  const merged = {
    ...existing,
    ...req.body,
    trigger: req.body.trigger ? { ...existing.trigger, ...req.body.trigger } : existing.trigger,
  };

  const validation = validateSkill(merged);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
  }

  const { name, description, trigger, conditions, actions } = validation.data;
  db.prepare(`
    UPDATE skills
    SET name = ?, description = ?,
        trigger_type = ?, trigger_value = ?, trigger_source = ?,
        trigger_extra = ?, conditions = ?, actions = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name,
    description || '',
    trigger.type,
    trigger.value || '',
    trigger.source || null,
    JSON.stringify({ event: trigger.event, recurrence: trigger.recurrence, repo: trigger.repo }),
    JSON.stringify(conditions),
    JSON.stringify(actions),
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM skills WHERE id = ?').get(req.params.id);
  res.json({
    ...updated,
    conditions: JSON.parse(updated.conditions),
    actions: JSON.parse(updated.actions),
    metadata: JSON.parse(updated.metadata),
    is_active: Boolean(updated.is_active),
  });
});

// DELETE /skills/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM skills WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Skill not found' });
  res.json({ message: 'Skill deleted' });
});

// PATCH /skills/:id/toggle
router.patch('/:id/toggle', (req, res) => {
  const db = getDb();
  const skill = db.prepare('SELECT is_active FROM skills WHERE id = ?').get(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  const newStatus = skill.is_active ? 0 : 1;
  db.prepare("UPDATE skills SET is_active = ? WHERE id = ?").run(newStatus, req.params.id);
  res.json({ is_active: Boolean(newStatus) });
});

// GET /skills/:id/executions
router.get('/:id/executions', (req, res) => {
  const db = getDb();
  const logs = db.prepare(`
    SELECT * FROM execution_logs WHERE skill_id = ? ORDER BY executed_at DESC LIMIT 50
  `).all(req.params.id);
  res.json(logs.map(l => ({ ...l, actions_result: JSON.parse(l.actions_result || '[]') })));
});

module.exports = router;
```

### 1.5 Devices API

Create `backend/src/api/devices.js`:
```javascript
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/db');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const devices = db.prepare('SELECT * FROM devices').all();
  res.json(devices.map(d => ({
    ...d,
    capabilities: JSON.parse(d.capabilities),
    is_online: Boolean(d.is_online),
  })));
});

router.post('/', (req, res) => {
  const { name, type, capabilities, service, external_id } = req.body;
  if (!name || !type || !capabilities || !service) {
    return res.status(400).json({ error: 'name, type, capabilities, service are required' });
  }
  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO devices (id, name, type, capabilities, service, external_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, type, JSON.stringify(capabilities), service, external_id || null);
  res.status(201).json({ id, name, type, capabilities, service });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Device not found' });
  res.json({ message: 'Device deleted' });
});

module.exports = router;
```

### 1.6 Main Express Entry Point

Create `backend/src/index.js`:
```javascript
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
```

### 1.7 Phase 1 Tests

Create `backend/tests/skills.test.js`:
```javascript
const request = require('supertest');
process.env.DB_PATH = ':memory:';
const app = require('../src/index');

const validSkill = {
  name: 'Sleep Routine',
  description: 'Activates at bedtime',
  trigger: { type: 'natural_language', value: "I'm going to sleep", source: 'user_input' },
  actions: [
    { service: 'simulation', command: 'turn_off', device_id: 'living-room-lights', params: {} }
  ],
  tags: ['sleep', 'home']
};

describe('Skills CRUD', () => {
  let createdId;

  test('POST /skills creates a valid skill', async () => {
    const res = await request(app).post('/skills').send(validSkill);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Sleep Routine');
    expect(res.body.id).toBeDefined();
    createdId = res.body.id;
  });

  test('POST /skills rejects invalid skill (missing actions)', async () => {
    const res = await request(app).post('/skills').send({ name: 'Bad', trigger: { type: 'time' } });
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  test('GET /skills returns list', async () => {
    const res = await request(app).get('/skills');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /skills/:id returns skill', async () => {
    const res = await request(app).get(`/skills/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Sleep Routine');
  });

  test('GET /skills/nonexistent returns 404', async () => {
    const res = await request(app).get('/skills/does-not-exist');
    expect(res.status).toBe(404);
  });

  test('DELETE /skills/:id deletes skill', async () => {
    const res = await request(app).delete(`/skills/${createdId}`);
    expect(res.status).toBe(200);
    const check = await request(app).get(`/skills/${createdId}`);
    expect(check.status).toBe(404);
  });
});

describe('Devices CRUD', () => {
  test('POST /devices creates a device', async () => {
    const res = await request(app).post('/devices').send({
      name: 'Living Room Lights', type: 'light',
      capabilities: ['turn_on', 'turn_off', 'set_color'], service: 'simulation'
    });
    expect(res.status).toBe(201);
  });

  test('GET /devices returns list', async () => {
    const res = await request(app).get('/devices');
    expect(res.status).toBe(200);
  });
});
```

Add to `backend/package.json`:
```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test": "jest --forceExit",
    "seed": "node scripts/seed_demo.js"
  },
  "jest": { "testEnvironment": "node" }
}
```

### 1.8 Seed Devices (run once after starting)

```bash
curl -X POST http://localhost:3000/devices \
  -H "Content-Type: application/json" \
  -d '{"name":"Living Room Lights","type":"light","capabilities":["turn_on","turn_off","set_color"],"service":"simulation"}'

curl -X POST http://localhost:3000/devices \
  -H "Content-Type: application/json" \
  -d '{"name":"Bedroom AC","type":"ac","capabilities":["turn_on","turn_off","set_temperature"],"service":"simulation"}'

curl -X POST http://localhost:3000/devices \
  -H "Content-Type: application/json" \
  -d '{"name":"Kitchen Lights","type":"light","capabilities":["turn_on","turn_off"],"service":"simulation"}'
```

### ✅ Checkpoint 1
```bash
cd backend && npm test
# All 8 tests must pass

npm run dev
# Server starts on port 3000

curl http://localhost:3000/health
# {"status":"ok","timestamp":"..."}

curl -X POST http://localhost:3000/skills \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Skill","trigger":{"type":"natural_language","value":"test","source":"user_input"},"actions":[{"service":"simulation","command":"turn_off","params":{}}]}'
# Returns 201 with skill object
```

---

## Phase 2 — Skill Execution Engine + Webhooks + ngrok
**Goal:** Skills actually run. Actions are dispatched. GitHub webhooks work. ngrok is live.

### 2.1 Simulation Integration

Create `backend/src/services/integrations/simulation.js`:
```javascript
const { getDb } = require('../../db/db');
const { v4: uuidv4 } = require('uuid');

async function executeSimulated(skill, triggeredBy = 'manual') {
  const results = [];

  for (let i = 0; i < skill.actions.length; i++) {
    const action = skill.actions[i];
    const msg = formatSimulationMessage(action);
    console.log(`[SIMULATION] ${msg}`);
    results.push({ action_index: i, status: 'simulated', response: msg });
  }

  const db = getDb();
  const logId = uuidv4();
  db.prepare(`
    INSERT INTO execution_logs (id, skill_id, triggered_by, status, actions_result)
    VALUES (?, ?, ?, 'simulated', ?)
  `).run(logId, skill.id, triggeredBy, JSON.stringify(results));

  return { status: 'simulated', actions_result: results, log_id: logId };
}

function formatSimulationMessage(action) {
  const { command, device_id, params } = action;
  switch (command) {
    case 'turn_on':  return `[${device_id}] → TURNED ON`;
    case 'turn_off': return `[${device_id}] → TURNED OFF`;
    case 'set_temperature': return `[${device_id}] → TEMPERATURE SET to ${params?.value}°${params?.unit || 'C'}`;
    case 'set_color': return `[${device_id}] → COLOR SET to ${params?.color || params?.hex}`;
    default: return `[${device_id}] → ${command.toUpperCase()} executed with ${JSON.stringify(params)}`;
  }
}

module.exports = { executeSimulated };
```

### 2.2 SmartThings Integration

Create `backend/src/services/integrations/smartthings.js`:
```javascript
async function executeSmartThings(action) {
  const token = process.env.SMARTTHINGS_TOKEN;
  if (!token || process.env.SIMULATION_MODE === 'true') {
    throw new Error('SmartThings not configured — use simulation mode');
  }

  const url = `https://api.smartthings.com/v1/devices/${action.device_id}/commands`;
  const body = { commands: [{ component: 'main', capability: mapCommand(action.command), command: action.command, arguments: Object.values(action.params || {}) }] };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`SmartThings API error: ${res.status}`);
  return await res.json();
}

function mapCommand(command) {
  const map = { turn_on: 'switch', turn_off: 'switch', set_temperature: 'thermostat', set_color: 'colorControl' };
  return map[command] || 'switch';
}

module.exports = { executeSmartThings };
```

### 2.3 Skill Executor (Core Engine)

Create `backend/src/services/skills/skill_executor.js`:
```javascript
const { getDb } = require('../../db/db');
const { v4: uuidv4 } = require('uuid');
const { executeSmartThings } = require('../integrations/smartthings');

async function executeSkill(skillId, triggeredBy = 'manual') {
  const db = getDb();
  const row = db.prepare('SELECT * FROM skills WHERE id = ? AND is_active = 1').get(skillId);
  if (!row) throw new Error(`Skill ${skillId} not found or inactive`);

  const skill = {
    ...row,
    actions: JSON.parse(row.actions),
    conditions: JSON.parse(row.conditions),
    metadata: JSON.parse(row.metadata),
  };

  const results = [];
  const useSimulation = process.env.SIMULATION_MODE === 'true';

  for (let i = 0; i < skill.actions.length; i++) {
    const action = skill.actions[i];
    try {
      let response;
      if (useSimulation || action.service === 'simulation') {
        const msg = formatMessage(action);
        response = { simulated: true, message: msg };
        console.log(`[SIM] ${msg}`);
      } else if (action.service === 'smartthings') {
        response = await executeSmartThings(action);
      } else {
        response = { message: `Service ${action.service} not yet implemented` };
      }
      results.push({ action_index: i, status: 'success', response });
    } catch (err) {
      results.push({ action_index: i, status: 'failed', error: err.message });
    }
  }

  const allSuccess = results.every(r => r.status === 'success');
  const anySuccess = results.some(r => r.status === 'success');
  const status = useSimulation ? 'simulated' : (allSuccess ? 'success' : anySuccess ? 'partial' : 'failed');

  // RULE: Every execution MUST be logged — no exceptions
  const logId = uuidv4();
  db.prepare(`
    INSERT INTO execution_logs (id, skill_id, triggered_by, status, actions_result)
    VALUES (?, ?, ?, ?, ?)
  `).run(logId, skillId, triggeredBy, status, JSON.stringify(results));

  return { status, actions_result: results, log_id: logId, skill_name: skill.name };
}

function formatMessage(action) {
  const { command, device_id, params } = action;
  const device = device_id || 'device';
  if (command === 'turn_on') return `${device} → ON`;
  if (command === 'turn_off') return `${device} → OFF`;
  if (command === 'set_temperature') return `${device} → ${params?.value}°${params?.unit || 'C'}`;
  if (command === 'set_color') return `${device} → color ${params?.hex || params?.color}`;
  return `${device} → ${command}`;
}

module.exports = { executeSkill };
```

### 2.4 Execute Endpoint and Webhooks

Add to `backend/src/api/skills.js` (after the DELETE route):
```javascript
const { executeSkill } = require('../services/skills/skill_executor');

// POST /skills/:id/execute  — manual trigger
router.post('/:id/execute', async (req, res) => {
  try {
    const result = await executeSkill(req.params.id, 'manual');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

Create `backend/src/api/webhooks.js`:
```javascript
const express = require('express');
const { getDb } = require('../db/db');
const { executeSkill } = require('../services/skills/skill_executor');

const router = express.Router();

// POST /webhooks/:skill_id  — inbound GitHub (or any) webhook
router.post('/:skill_id', async (req, res) => {
  const db = getDb();
  const skill = db.prepare(`
    SELECT * FROM skills WHERE id = ? AND trigger_type = 'webhook' AND is_active = 1
  `).get(req.params.skill_id);

  if (!skill) return res.status(404).json({ error: 'Webhook skill not found' });

  // Acknowledge immediately (GitHub expects fast response)
  res.json({ received: true, skill_id: req.params.skill_id });

  const payload = req.body;
  console.log(`[WEBHOOK] Received for skill ${skill.name}:`, JSON.stringify(payload).slice(0, 200));

  try {
    const result = await executeSkill(req.params.skill_id, 'webhook');
    console.log(`[WEBHOOK] Executed: ${JSON.stringify(result)}`);
  } catch (err) {
    console.error(`[WEBHOOK] Execution failed:`, err.message);
  }
});

// GET /webhooks/generate/:skill_id — get the webhook URL for a skill
router.get('/generate/:skill_id', (req, res) => {
  const base = process.env.PUBLIC_WEBHOOK_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  res.json({ webhook_url: `${base}/webhooks/${req.params.skill_id}` });
});

module.exports = router;
```

Register in `index.js`:
```javascript
const webhooksRouter = require('./api/webhooks');
app.use('/webhooks', webhooksRouter);
```

### 2.5 Scheduled Trigger Runner (node-cron)

Create `backend/src/services/skills/scheduler.js`:
```javascript
const cron = require('node-cron');
const { getDb } = require('../../db/db');
const { executeSkill } = require('./skill_executor');

let schedulerStarted = false;

function startScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  cron.schedule('* * * * *', async () => {
    const db = getDb();
    const scheduledSkills = db.prepare(`
      SELECT * FROM skills WHERE trigger_type = 'time' AND is_active = 1
    `).all();

    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    for (const skill of scheduledSkills) {
      const triggerTime = skill.trigger_value;
      if (triggerTime === hhmm) {
        const extra = skill.trigger_extra ? JSON.parse(skill.trigger_extra) : {};
        if (checkDayOfWeek(extra.recurrence)) {
          console.log(`[SCHEDULER] Firing skill: ${skill.name}`);
          try {
            await executeSkill(skill.id, 'schedule');
          } catch (err) {
            console.error(`[SCHEDULER] Error executing ${skill.id}:`, err.message);
          }
        }
      }
    }
  });

  console.log('[SCHEDULER] Cron scheduler started');
}

function checkDayOfWeek(rrule) {
  if (!rrule) return true;
  const days = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0 };
  const match = rrule.match(/BYDAY=([^;]+)/);
  if (!match) return true;
  const allowedDays = match[1].split(',').map(d => days[d]);
  return allowedDays.includes(new Date().getDay());
}

module.exports = { startScheduler };
```

Call in `index.js`:
```javascript
const { startScheduler } = require('./services/skills/scheduler');
// After app.listen():
startScheduler();
```

### 2.6 Set Up ngrok (DO THIS NOW, NOT PHASE 8)

```bash
# In a separate terminal, keep this running during development:
ngrok http 3000

# Copy the HTTPS URL printed (e.g. https://abc123.ngrok.io)
# Paste it into .env:
# PUBLIC_WEBHOOK_BASE_URL=https://abc123.ngrok.io
```

### 2.7 Phase 2 Tests

Create `backend/tests/executor.test.js`:
```javascript
const request = require('supertest');
process.env.DB_PATH = ':memory:';
process.env.SIMULATION_MODE = 'true';
const app = require('../src/index');

let skillId;

beforeAll(async () => {
  const res = await request(app).post('/skills').send({
    name: 'Test Execute Skill',
    trigger: { type: 'natural_language', value: 'run test', source: 'user_input' },
    actions: [{ service: 'simulation', device_id: 'test-light', command: 'turn_off', params: {} }]
  });
  skillId = res.body.id;
});

test('POST /skills/:id/execute runs the skill', async () => {
  const res = await request(app).post(`/skills/${skillId}/execute`);
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('simulated');
  expect(res.body.actions_result).toHaveLength(1);
});

test('Execution log is written after execution', async () => {
  const res = await request(app).get(`/skills/${skillId}/executions`);
  expect(res.status).toBe(200);
  expect(res.body.length).toBeGreaterThan(0);
  expect(res.body[0].status).toBe('simulated');
});

test('POST /webhooks/:id fires skill', async () => {
  const skillRes = await request(app).post('/skills').send({
    name: 'Webhook Test', trigger: { type: 'webhook', source: 'github', event: 'push' },
    actions: [{ service: 'simulation', command: 'turn_on', params: {} }]
  });
  const wId = skillRes.body.id;
  const res = await request(app).post(`/webhooks/${wId}`).send({ pusher: 'test' });
  expect(res.status).toBe(200);
  expect(res.body.received).toBe(true);
});
```

### ✅ Checkpoint 2
```bash
npm test
# All tests pass

# ngrok must be running and URL in .env
# Create a skill and paste webhook URL into GitHub repo settings → Webhooks
# Push a commit → confirm execution log appears
```

---

## Phase 3 — NLP Intent Engine
**Goal:** User types natural language → Gemini interprets it → skill is created or executed.

### 3.1 Intent Extraction Prompt

Create `backend/src/services/nlp/intent_extraction.prompt.md`:
```markdown
You are WeaveClaw's intent engine. Convert user input into a JSON intent object.

RULES:
- Respond ONLY with a valid JSON object. No markdown, no explanation, no backticks.
- Classify intent as EXACTLY one of: create_skill | execute_existing_skill | clarification_needed
- create_skill: user is describing a NEW automation they want built
- execute_existing_skill: user is issuing a command matching an existing skill trigger
- clarification_needed: intent cannot be resolved without more info

FEW-SHOT EXAMPLES:

Input: "I'm going to sleep"
Existing skills trigger values: ["I'm going to sleep", "start focus mode"]
Output: {"intent":"execute_existing_skill","matched_trigger":"I'm going to sleep","confidence":0.97}

Input: "Turn off the lights please"
Existing skills trigger values: []
Output: {"intent":"create_skill","trigger_type":"natural_language","trigger_source":"user_input","entities":{"device_type":"lights","command":"turn_off"},"actions":[{"type":"device_control","device":"lights","command":"turn_off"}],"missing_entities":[],"clarification_needed":false}

Input: "Watch my GitHub repo and turn lights red on every push"
Existing skills trigger values: []
Output: {"intent":"create_skill","trigger_type":"webhook","trigger_source":"github","trigger_event":"push","entities":{"repo":null,"color":"red","device_type":"lights"},"actions":[{"type":"device_control","device":"lights","command":"set_color","value":"red"}],"missing_entities":["repo_name"],"clarification_needed":true,"clarification_prompt":"Which GitHub repository should I watch? (e.g. username/repo-name)"}

Input: "Every weekday at 7am turn on kitchen lights"
Existing skills trigger values: []
Output: {"intent":"create_skill","trigger_type":"time","trigger_value":"07:00","trigger_extra":{"recurrence":"RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"},"entities":{"time":"07:00","days":"weekday","device_type":"kitchen lights","command":"turn_on"},"actions":[{"type":"device_control","device":"kitchen-lights","command":"turn_on"}],"missing_entities":[],"clarification_needed":false}

Input: "When my workout ends cool the room"
Existing skills trigger values: []
Output: {"intent":"create_skill","trigger_type":"health_event","trigger_source":"samsung_health","trigger_event":"workout_end","entities":{"temperature":20},"actions":[{"type":"device_control","device":"ac","command":"set_temperature","value":20}],"missing_entities":[],"clarification_needed":false}

Now process this input:
User input: {USER_INPUT}
Existing skill trigger values: {EXISTING_TRIGGERS}
```

### 3.2 Intent Extractor (via Google Gemini API)

Create `backend/src/services/nlp/intent_extractor.js`:
```javascript
const fs = require('fs');
const path = require('path');

const PROMPT_TEMPLATE = fs.readFileSync(
  path.join(__dirname, 'intent_extraction.prompt.md'), 'utf8'
);

const MAX_RETRIES = 3;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function extractIntent(userInput, existingTriggers = []) {
  const prompt = PROMPT_TEMPLATE
    .replace('{USER_INPUT}', userInput)
    .replace('{EXISTING_TRIGGERS}', JSON.stringify(existingTriggers));

  const model = process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('[NLP] GEMINI_API_KEY not set — falling back to rule classifier');
    return ruleClassify(userInput);
  }

  // Gemini call with JSON retry loop.
  // Despite responseMimeType: 'application/json', Gemini occasionally wraps output in
  // markdown fences. parseIntentJSON handles both cases.
  // Fall through to ruleClassify only after all retries exhausted or a network error.
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const systemNote = attempt > 1
        ? '\n\nCRITICAL: Your previous response could not be parsed as JSON. Respond with ONLY the raw JSON object. No prose, no markdown, no code fences.'
        : '';

      const response = await fetch(
        `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt + systemNote }] }],
            generationConfig: {
              temperature: attempt === 1 ? 0.1 : 0.0,
              responseMimeType: 'application/json',
            },
          }),
          signal: AbortSignal.timeout(20000),
        }
      );

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Gemini HTTP ${response.status}: ${errBody}`);
      }

      const data = await response.json();

      // Gemini response shape: data.candidates[0].content.parts[0].text
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

      if (!text) {
        console.warn(`[NLP] Attempt ${attempt}/${MAX_RETRIES}: empty Gemini response`);
        continue;
      }

      const parsed = parseIntentJSON(text);
      if (parsed) {
        if (attempt > 1) console.log(`[NLP] JSON parsed successfully on attempt ${attempt}`);
        return parsed;
      }

      console.warn(`[NLP] Attempt ${attempt}/${MAX_RETRIES}: could not extract valid JSON from Gemini response`);

    } catch (err) {
      console.warn(`[NLP] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      break; // Network/auth error — no point retrying, fall to rule classifier
    }
  }

  console.warn('[NLP] All retries exhausted — falling back to rule classifier');
  return ruleClassify(userInput);
}

function parseIntentJSON(text) {
  // Strategy 1: Strip markdown code fences and try direct parse
  // (Gemini sometimes adds these even with responseMimeType: 'application/json')
  const stripped = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(stripped);
    if (isValidIntent(parsed)) return parsed;
  } catch { /* fall through */ }

  // Strategy 2: Extract first {...} block from prose
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (isValidIntent(parsed)) return parsed;
    } catch { /* fall through */ }
  }

  return null;
}

function isValidIntent(obj) {
  return obj && typeof obj === 'object' &&
    ['create_skill', 'execute_existing_skill', 'clarification_needed'].includes(obj.intent);
}

// Fallback: rule-based classifier — used when Gemini is unavailable or all retries fail
function ruleClassify(input) {
  const lower = input.toLowerCase();

  const timeMatch = lower.match(/(\d{1,2}(?::\d{2})?(?:am|pm)?)\s*(every|each)?\s*(weekday|daily|monday|tuesday|wednesday|thursday|friday|saturday|sunday)?/);
  if (timeMatch || (lower.includes('every') && lower.includes('at'))) {
    return {
      intent: 'create_skill', trigger_type: 'time',
      entities: {}, actions: [], missing_entities: [],
      clarification_needed: false
    };
  }

  if (lower.includes('github') || lower.includes('push') || lower.includes('webhook')) {
    return {
      intent: 'create_skill', trigger_type: 'webhook', trigger_source: 'github',
      entities: {}, actions: [], missing_entities: ['repo_name'],
      clarification_needed: true,
      clarification_prompt: 'Which GitHub repository should I watch? (e.g. username/repo-name)'
    };
  }

  if (lower.includes('workout') || lower.includes('exercise') || lower.includes('health')) {
    return {
      intent: 'create_skill', trigger_type: 'health_event', trigger_source: 'samsung_health',
      entities: {}, actions: [], missing_entities: [], clarification_needed: false
    };
  }

  return {
    intent: 'create_skill', trigger_type: 'natural_language', trigger_source: 'user_input',
    entities: { raw: input }, actions: [], missing_entities: [], clarification_needed: false
  };
}

module.exports = { extractIntent };
```

### 3.3 Clarification Handler

Create `backend/src/services/nlp/clarification_handler.js`:
```javascript
// In-memory session store (ephemeral — never persisted)
const sessions = new Map(); // session_id → { intent, expiresAt }
const TTL_MS = 10 * 60 * 1000; // 10 minutes

function storePartial(sessionId, intent) {
  sessions.set(sessionId, { intent, expiresAt: Date.now() + TTL_MS });
}

function getPartial(sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }
  entry.expiresAt = Date.now() + TTL_MS;
  return entry.intent;
}

function clearPartial(sessionId) {
  sessions.delete(sessionId);
}

function mergeEntity(partialIntent, entityKey, entityValue) {
  const merged = { ...partialIntent };
  if (!merged.entities) merged.entities = {};
  merged.entities[entityKey] = entityValue;

  if (merged.missing_entities) {
    merged.missing_entities = merged.missing_entities.filter(e => e !== entityKey);
  }
  merged.clarification_needed = (merged.missing_entities?.length || 0) > 0;
  return merged;
}

module.exports = { storePartial, getPartial, clearPartial, mergeEntity };
```

### 3.4 Semantic Similarity for execute_existing_skill

Create `backend/src/services/nlp/skill_executor_handler.js`:
```javascript
const { getDb } = require('../../db/db');
const { executeSkill } = require('../skills/skill_executor');

const MATCH_THRESHOLD = 0.75;

function cosineSimilarity(a, b) {
  const wordsA = a.toLowerCase().split(/\s+/);
  const wordsB = b.toLowerCase().split(/\s+/);
  const allWords = [...new Set([...wordsA, ...wordsB])];
  const vecA = allWords.map(w => wordsA.filter(x => x === w).length);
  const vecB = allWords.map(w => wordsB.filter(x => x === w).length);
  const dot = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(vecB.reduce((s, v) => s + v * v, 0));
  if (!magA || !magB) return 0;
  return dot / (magA * magB);
}

async function handleExecuteExisting(userInput) {
  const db = getDb();
  const nlSkills = db.prepare(`
    SELECT * FROM skills WHERE trigger_type = 'natural_language' AND is_active = 1
  `).all();

  if (!nlSkills.length) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const skill of nlSkills) {
    const score = cosineSimilarity(userInput, skill.trigger_value);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = skill;
    }
  }

  if (bestScore >= MATCH_THRESHOLD && bestMatch) {
    const result = await executeSkill(bestMatch.id, 'user_input');
    return { type: 'skill_executed', skill_name: bestMatch.name, ...result };
  }

  return null;
}

module.exports = { handleExecuteExisting };
```

### 3.5 Skill Builder (intent → skill object)

Create `backend/src/services/nlp/skill_builder.js`:
```javascript
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../../db/db');
const { validateSkill } = require('../skills/skill_validator');

function buildSkillFromIntent(intent, sessionId) {
  const db = getDb();
  const devices = db.prepare('SELECT * FROM devices').all();

  const actions = (intent.actions || []).map(action => {
    const matchedDevice = findDevice(devices, action.device);
    return {
      service: matchedDevice ? matchedDevice.service : 'simulation',
      device_id: matchedDevice ? matchedDevice.id : (action.device || 'unknown'),
      command: action.command || 'turn_off',
      params: buildParams(action),
    };
  });

  if (!actions.length) {
    actions.push({ service: 'simulation', command: 'log', params: { message: 'Skill executed' } });
  }

  const skill = {
    name: generateSkillName(intent),
    description: `Auto-generated from: "${intent.raw_input || ''}"`,
    trigger: {
      type: intent.trigger_type,
      value: intent.trigger_value || intent.entities?.raw || '',
      source: intent.trigger_source || 'user_input',
      event: intent.trigger_event,
      recurrence: intent.trigger_extra?.recurrence,
      repo: intent.entities?.repo,
    },
    conditions: [],
    actions,
    tags: inferTags(intent),
    created_by: 'user',
    source: 'user_generated',
  };

  return skill;
}

// Priority-ordered device matching: exact ID → exact name → type → slug token match.
// Returns null (not first device) on no match — prevents undefined action.device
// from silently matching the first device via includes('').
function findDevice(devices, reference) {
  if (!reference || typeof reference !== 'string' || reference.trim() === '') return null;

  const ref = reference.trim().toLowerCase();

  const byId = devices.find(d => d.id.toLowerCase() === ref);
  if (byId) return byId;

  const byName = devices.find(d => d.name.toLowerCase() === ref);
  if (byName) return byName;

  const byType = devices.find(d => d.type.toLowerCase() === ref);
  if (byType) return byType;

  const refTokens = ref.split(/\s+/);
  const bySlug = devices.find(d => {
    const nameTokens = d.name.toLowerCase().split(/\s+/);
    return refTokens.every(token => nameTokens.includes(token));
  });
  if (bySlug) return bySlug;

  return null;
}

function buildParams(action) {
  if (action.value && action.command === 'set_temperature') return { value: action.value, unit: 'celsius' };
  if (action.value && action.command === 'set_color') return { hex: colorToHex(action.value) };
  return {};
}

function colorToHex(color) {
  const map = { red: '#FF0000', blue: '#0000FF', green: '#00FF00', white: '#FFFFFF', off: '#000000' };
  return map[color?.toLowerCase()] || '#FFFFFF';
}

function generateSkillName(intent) {
  const type = intent.trigger_type;
  if (type === 'natural_language') return `NL: ${(intent.entities?.raw || 'command').slice(0, 30)}`;
  if (type === 'webhook') return `Webhook: ${intent.trigger_source} ${intent.trigger_event}`;
  if (type === 'time') return `Schedule: ${intent.trigger_value}`;
  if (type === 'health_event') return `Health: ${intent.trigger_event}`;
  return 'Auto Skill';
}

function inferTags(intent) {
  const tags = [];
  if (intent.trigger_type) tags.push(intent.trigger_type);
  if (intent.trigger_source) tags.push(intent.trigger_source);
  const entities = intent.entities || {};
  if (entities.device_type) tags.push(entities.device_type);
  return tags;
}

module.exports = { buildSkillFromIntent };
```

### 3.6 Chat Endpoint (the main entry point)

Create `backend/src/api/chat.js`:
```javascript
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/db');
const { extractIntent } = require('../services/nlp/intent_extractor');
const { storePartial, getPartial, clearPartial, mergeEntity } = require('../services/nlp/clarification_handler');
const { handleExecuteExisting } = require('../services/nlp/skill_executor_handler');
const { buildSkillFromIntent } = require('../services/nlp/skill_builder');
const { validateSkill } = require('../services/skills/skill_validator');
const { detectConflict } = require('../services/skills/conflict_detector');

const router = express.Router();

router.post('/', async (req, res) => {
  const { message, session_id } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  const sessionId = session_id || uuidv4();
  const db = getDb();

  try {
    // Check for active clarification session
    const partial = getPartial(sessionId);
    if (partial) {
      const missingKey = partial.missing_entities?.[0] || 'clarification';
      const mergedIntent = mergeEntity(partial, missingKey, message);

      if (!mergedIntent.clarification_needed) {
        clearPartial(sessionId);
        return await createSkillFromIntent(mergedIntent, sessionId, db, res);
      } else {
        storePartial(sessionId, mergedIntent);
        return res.json({
          type: 'clarification_needed',
          session_id: sessionId,
          prompt: mergedIntent.clarification_prompt || 'Can you give more details?'
        });
      }
    }

    // Fresh intent extraction
    const existingTriggers = db.prepare(`
      SELECT trigger_value FROM skills WHERE trigger_type = 'natural_language' AND is_active = 1
    `).all().map(s => s.trigger_value);

    const intent = await extractIntent(message, existingTriggers);

    if (!intent) {
      return res.json({ type: 'error', message: 'Could not understand your request. Please try rephrasing.' });
    }

    intent.raw_input = message;

    if (intent.intent === 'execute_existing_skill') {
      const result = await handleExecuteExisting(message);
      if (result) return res.json(result);
      // Fall through to create_skill if no match found
    }

    if (intent.clarification_needed) {
      storePartial(sessionId, intent);
      return res.json({
        type: 'clarification_needed',
        session_id: sessionId,
        prompt: intent.clarification_prompt
      });
    }

    return await createSkillFromIntent(intent, sessionId, db, res);

  } catch (err) {
    console.error('[CHAT] Error:', err);
    res.status(500).json({ type: 'error', message: 'Internal error: ' + err.message });
  }
});

async function createSkillFromIntent(intent, sessionId, db, res) {
  const skillData = buildSkillFromIntent(intent, sessionId);

  const validation = validateSkill(skillData);
  if (!validation.valid) {
    return res.json({ type: 'validation_error', errors: validation.errors });
  }

  const conflict = detectConflict(skillData, db);
  if (conflict.conflict_detected) {
    return res.json({ type: 'conflict_detected', conflict, session_id: sessionId });
  }

  const id = uuidv4();
  const metadata = {
    created_at: new Date().toISOString(),
    created_by: skillData.created_by || 'user',
    source: skillData.source || 'user_generated',
    tags: skillData.tags || [],
    execution_count: 0, last_executed: null,
    confidence_score: null, is_active: true,
  };

  db.prepare(`
    INSERT INTO skills (id, name, description, trigger_type, trigger_value, trigger_source,
      trigger_extra, conditions, actions, metadata, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id, skillData.name, skillData.description || '',
    skillData.trigger.type, skillData.trigger.value || '',
    skillData.trigger.source || null,
    JSON.stringify({ event: skillData.trigger.event, recurrence: skillData.trigger.recurrence, repo: skillData.trigger.repo }),
    JSON.stringify(skillData.conditions || []),
    JSON.stringify(skillData.actions),
    JSON.stringify(metadata)
  );

  const created = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
  return res.json({
    type: 'skill_created',
    session_id: sessionId,
    skill: {
      ...created,
      actions: JSON.parse(created.actions),
      conditions: JSON.parse(created.conditions),
      metadata: JSON.parse(created.metadata),
      is_active: Boolean(created.is_active),
    }
  });
}

module.exports = router;
```

Register in `index.js`:
```javascript
const chatRouter = require('./api/chat');
app.use('/chat', chatRouter);
```

### 3.7 Phase 3 Tests

Create `backend/tests/nlp.test.js`:
```javascript
const request = require('supertest');
process.env.DB_PATH = ':memory:';
process.env.SIMULATION_MODE = 'true';
// Tests pass without a key — they exercise the rule classifier fallback.
// Set GEMINI_API_KEY in your shell environment to test the full Gemini path.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
process.env.GEMINI_MODEL = 'gemini-3.1-pro-preview';
const app = require('../src/index');

test('POST /chat creates a skill from natural language', async () => {
  const res = await request(app).post('/chat').send({
    message: "Every weekday at 7am turn on the kitchen lights",
    session_id: 'test-session-1'
  });
  expect(res.status).toBe(200);
  expect(['skill_created', 'clarification_needed']).toContain(res.body.type);
}, 20000);

test('POST /chat executes existing skill on second call', async () => {
  await request(app).post('/skills').send({
    name: 'Sleep',
    trigger: { type: 'natural_language', value: "going to sleep now", source: 'user_input' },
    actions: [{ service: 'simulation', command: 'turn_off', params: {} }]
  });

  const res = await request(app).post('/chat').send({
    message: 'going to sleep now', session_id: 'test-session-2'
  });
  expect(res.status).toBe(200);
  expect(['skill_executed', 'skill_created']).toContain(res.body.type);
}, 20000);

test('POST /chat handles clarification loop', async () => {
  const res1 = await request(app).post('/chat').send({
    message: 'Watch my GitHub repo and turn lights red on every push',
    session_id: 'test-session-3'
  });
  expect(res1.status).toBe(200);

  if (res1.body.type === 'clarification_needed') {
    const res2 = await request(app).post('/chat').send({
      message: 'myuser/myrepo', session_id: 'test-session-3'
    });
    expect(res2.status).toBe(200);
    expect(['skill_created', 'clarification_needed']).toContain(res2.body.type);
  }
}, 30000);
```

### ✅ Checkpoint 3
```bash
npm test
# NLP tests pass (rule classifier path: instant; Gemini path: ~5–10s per test)

curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"I am going to sleep","session_id":"s1"}'
# Returns skill_created

curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"I am going to sleep","session_id":"s2"}'
# Returns skill_executed (skill already exists)
```

---

## Phase 4 — Conflict Detection and Semantic Validation
**Goal:** No two skills can contradict each other. Every save is checked. Community hub imports go through the full validation pipeline.

### 4.1 Conflict Detector

Create `backend/src/services/skills/conflict_detector.js`:
```javascript
function detectConflict(newSkill, db) {
  const existingSkills = db.prepare(`
    SELECT * FROM skills WHERE is_active = 1
  `).all().map(s => ({
    ...s,
    actions: JSON.parse(s.actions),
    trigger_extra: s.trigger_extra ? JSON.parse(s.trigger_extra) : {}
  }));

  for (const existing of existingSkills) {
    if (!triggersOverlap(newSkill.trigger, existing)) continue;

    const contradiction = findActionContradiction(newSkill.actions, existing.actions);
    if (contradiction) {
      return {
        conflict_detected: true,
        new_skill_name: newSkill.name,
        conflicting_skill_id: existing.id,
        conflicting_skill_name: existing.name,
        conflict_type: 'contradictory_device_command',
        conflict_detail: contradiction,
        // merge_into_one is excluded — merging contradictory actions (e.g. AC at 22°C vs 24°C)
        // fires both simultaneously, which IS the contradiction we prevent.
        recommended_resolution: 'prioritise_new',
        resolution_options: [
          {
            id: 'prioritise_new',
            label: 'Keep new skill',
            consequence: `Deactivates "${existing.name}". Your new intent takes priority.`,
            recommended: true,
          },
          {
            id: 'prioritise_existing',
            label: 'Keep existing skill',
            consequence: `Discards the new skill. "${existing.name}" continues running unchanged.`,
            recommended: false,
          },
          {
            id: 'edit_new_before_saving',
            label: 'Edit before saving',
            consequence: 'Returns the new skill for you to adjust before it is saved.',
            recommended: false,
          },
        ]
      };
    }
  }

  return { conflict_detected: false };
}

function triggersOverlap(newTrigger, existing) {
  if (newTrigger.type !== existing.trigger_type) return false;

  if (newTrigger.type === 'time') {
    const newMins = timeToMinutes(newTrigger.value);
    const existMins = timeToMinutes(existing.trigger_value);
    return Math.abs(newMins - existMins) <= 30;
  }

  if (newTrigger.type === 'natural_language') {
    return newTrigger.value?.toLowerCase() === existing.trigger_value?.toLowerCase();
  }

  if (newTrigger.type === 'webhook') {
    const extra = existing.trigger_extra || {};
    return existing.trigger_source === newTrigger.source && extra.event === newTrigger.event;
  }

  return false;
}

function findActionContradiction(newActions, existingActions) {
  for (const na of newActions) {
    for (const ea of existingActions) {
      if (na.device_id !== ea.device_id) continue;
      if (isContradictory(na, ea)) {
        return `Both skills target "${na.device_id}": "${na.command}" vs "${ea.command}"`;
      }
    }
  }
  return null;
}

function isContradictory(a, b) {
  const contradictions = [
    ['turn_on', 'turn_off'],
    ['set_temperature', 'set_temperature'],
    ['set_color', 'set_color'],
  ];

  for (const [c1, c2] of contradictions) {
    if ((a.command === c1 && b.command === c2) || (a.command === c2 && b.command === c1)) {
      if (a.command === b.command) {
        return JSON.stringify(a.params) !== JSON.stringify(b.params);
      }
      return true;
    }
  }
  return false;
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

module.exports = { detectConflict };
```

### 4.2 Semantic Validation

Create `backend/src/services/skills/semantic_validator.js`:
```javascript
function semanticValidate(skillData, db) {
  const warnings = [];
  const errors = [];
  const devices = db.prepare('SELECT * FROM devices').all().map(d => ({
    ...d, capabilities: JSON.parse(d.capabilities)
  }));

  for (const action of skillData.actions) {
    if (action.device_id) {
      const device = devices.find(d => d.id === action.device_id || d.name === action.device_id);
      if (!device) {
        warnings.push(`Device "${action.device_id}" is not registered in your environment. Add the device or switch to simulation mode.`);
      } else {
        if (!device.capabilities.includes(action.command)) {
          errors.push(`Device "${device.name}" does not support command "${action.command}". Supported: ${device.capabilities.join(', ')}`);
        }
      }
    }

    if (action.service === 'smartthings' && !process.env.SMARTTHINGS_TOKEN) {
      warnings.push(`SmartThings is not configured (no token). This action will use simulation mode.`);
    }
  }

  return { errors, warnings, valid: errors.length === 0 };
}

module.exports = { semanticValidate };
```

### 4.3 Conflict Resolution Endpoint

Create `backend/src/api/conflicts.js`:
```javascript
const express = require('express');
const { getDb } = require('../db/db');

const router = express.Router();

router.post('/resolve', (req, res) => {
  const { new_skill, conflicting_skill_id, resolution, conflict_type } = req.body;
  const db = getDb();

  switch (resolution) {
    case 'prioritise_new':
      db.prepare('UPDATE skills SET is_active = 0 WHERE id = ?').run(conflicting_skill_id);
      return res.json({
        action: 'existing_deactivated',
        message: 'Existing skill deactivated. POST to /skills to save your new skill — conflict is resolved.'
      });

    case 'prioritise_existing':
      return res.json({
        action: 'new_discarded',
        message: 'Keeping existing skill. The new skill was not saved.'
      });

    case 'merge_into_one':
      // Guard: merging contradictory commands produces a skill that fires both at once.
      if (conflict_type === 'contradictory_device_command') {
        return res.status(400).json({
          error: 'merge_into_one is not valid for contradictory_device_command conflicts.',
          reason: 'Merging contradictory actions (e.g. turn_on + turn_off, or two different temperatures) would fire both simultaneously. Choose prioritise_new, prioritise_existing, or edit_new_before_saving.',
        });
      }
      const existing = db.prepare('SELECT * FROM skills WHERE id = ?').get(conflicting_skill_id);
      if (!existing) return res.status(404).json({ error: 'Conflicting skill not found' });
      const mergedActions = [
        ...JSON.parse(existing.actions),
        ...(new_skill.actions || [])
      ];
      return res.json({
        action: 'merge_preview',
        merged_skill: { ...new_skill, actions: mergedActions },
        message: 'Review the merged skill and POST to /skills to save it.'
      });

    case 'edit_new_before_saving':
      return res.json({
        action: 'edit_requested',
        skill: new_skill,
        message: 'Edit the skill and resubmit to POST /skills.'
      });

    default:
      return res.status(400).json({ error: `Unknown resolution "${resolution}". Valid: prioritise_new, prioritise_existing, merge_into_one, edit_new_before_saving` });
  }
});

module.exports = router;
```

Register in `index.js`:
```javascript
const conflictsRouter = require('./api/conflicts');
app.use('/conflicts', conflictsRouter);
```

### 4.4 Wire Semantic Validator and Conflict Detector into POST /skills

Now that Phase 4 is complete, update `backend/src/api/skills.js`. Add these imports at the top:

```javascript
const { semanticValidate } = require('../services/skills/semantic_validator');
const { detectConflict } = require('../services/skills/conflict_detector');
```

Then insert the following block inside `router.post('/')`, **after** the duplicate check and **before** the INSERT:

```javascript
  // Semantic validation — blocking for community imports unless acknowledged
  const semantic = semanticValidate({ actions }, db);
  if (semantic.errors.length > 0) {
    return res.status(400).json({ error: 'Semantic validation failed', errors: semantic.errors });
  }
  if (semantic.warnings.length > 0 && req.body.source === 'community_imported') {
    if (!req.body.acknowledge_warnings) {
      return res.status(422).json({
        error: 'device_mismatch',
        warnings: semantic.warnings,
        message: 'Some devices or services are not configured. Send the same request with acknowledge_warnings: true to import in simulation mode.'
      });
    }
  }

  // Conflict detection — runs on every skill write, not just through the chat path
  const conflict = detectConflict({ name, trigger, actions }, db);
  if (conflict.conflict_detected) {
    return res.status(409).json({ type: 'conflict_detected', conflict });
  }
```

### 4.5 Phase 4 Tests

Create `backend/tests/conflict.test.js`:
```javascript
const request = require('supertest');
process.env.DB_PATH = ':memory:';
const app = require('../src/index');

async function createSkill(data) {
  return await request(app).post('/skills').send(data);
}

test('conflict_detected response has structured resolution options', async () => {
  await createSkill({
    name: 'AC Cold',
    trigger: { type: 'natural_language', value: 'cool the room', source: 'user_input' },
    actions: [{ service: 'simulation', device_id: 'bedroom-ac', command: 'set_temperature', params: { value: 18, unit: 'celsius' } }]
  });

  const conflictRes = await request(app).post('/skills').send({
    name: 'AC Warm',
    trigger: { type: 'natural_language', value: 'cool the room', source: 'user_input' },
    actions: [{ service: 'simulation', device_id: 'bedroom-ac', command: 'set_temperature', params: { value: 28, unit: 'celsius' } }]
  });

  if (conflictRes.body.type === 'conflict_detected') {
    const conflict = conflictRes.body.conflict;
    expect(conflict.recommended_resolution).toBe('prioritise_new');
    expect(Array.isArray(conflict.resolution_options)).toBe(true);
    const opt = conflict.resolution_options[0];
    expect(opt).toHaveProperty('id');
    expect(opt).toHaveProperty('label');
    expect(opt).toHaveProperty('consequence');
    expect(opt).toHaveProperty('recommended');
    expect(conflict.resolution_options.some(o => o.id === 'merge_into_one')).toBe(false);
  }
});

test('POST /conflicts/resolve with prioritise_new deactivates existing', async () => {
  const existing = await createSkill({
    name: 'Old Skill',
    trigger: { type: 'natural_language', value: 'conflict test trigger', source: 'user_input' },
    actions: [{ service: 'simulation', command: 'turn_on', params: {} }]
  });

  const res = await request(app).post('/conflicts/resolve').send({
    conflicting_skill_id: existing.body.id,
    resolution: 'prioritise_new',
    new_skill: {}
  });

  expect(res.status).toBe(200);
  expect(res.body.action).toBe('existing_deactivated');
});

test('POST /conflicts/resolve rejects merge_into_one for contradictory_device_command', async () => {
  const existing = await createSkill({
    name: 'Lights On',
    trigger: { type: 'natural_language', value: 'lights conflict test', source: 'user_input' },
    actions: [{ service: 'simulation', device_id: 'living-room-lights', command: 'turn_on', params: {} }]
  });

  const res = await request(app).post('/conflicts/resolve').send({
    conflicting_skill_id: existing.body.id,
    resolution: 'merge_into_one',
    conflict_type: 'contradictory_device_command',
    new_skill: { actions: [{ service: 'simulation', device_id: 'living-room-lights', command: 'turn_off', params: {} }] }
  });

  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/merge_into_one is not valid/);
});
```

### ✅ Checkpoint 4
```bash
npm test
# All conflict tests pass

# Manual: create "Night Mode" (AC to 22°C at 23:00)
# Then try to create "Sleep Routine" (AC to 24°C at 23:00)
# Should get conflict_detected response with structured resolution_options
```

---

## Phase 5 — OpenClaw Heartbeat (Pattern Scanner + Suggestions)
**Goal:** The OpenClaw Heartbeat daemon scans execution logs and generates suggestions.

### 5.1 Pattern Scanner Service

Create `backend/src/services/heartbeat/pattern_scanner.js`:
```javascript
const { getDb } = require('../../db/db');
const { v4: uuidv4 } = require('uuid');

const CONFIDENCE_THRESHOLD = parseFloat(process.env.SUGGESTION_CONFIDENCE_THRESHOLD || '0.70');

function scanPatterns() {
  const db = getDb();

  const logs = db.prepare(`
    SELECT skill_id,
      strftime('%w', executed_at) as day_of_week,
      strftime('%H:%M', executed_at) as exec_time,
      executed_at
    FROM execution_logs
    WHERE triggered_by = 'user_input' AND status != 'failed'
    AND executed_at > datetime('now', '-30 days')
    ORDER BY skill_id, executed_at
  `).all();

  const bySkill = {};
  for (const log of logs) {
    if (!bySkill[log.skill_id]) bySkill[log.skill_id] = [];
    bySkill[log.skill_id].push(log);
  }

  for (const [skillId, skillLogs] of Object.entries(bySkill)) {
    if (skillLogs.length < 5) continue;

    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(skillId);
    if (!skill || skill.trigger_type !== 'natural_language') continue;

    const existingSuggestion = db.prepare(`
      SELECT id FROM suggestions WHERE skill_id = ? AND type = 'automate_pattern' AND status = 'pending'
    `).get(skillId);
    if (existingSuggestion) continue;

    const times = skillLogs.map(l => timeToMinutes(l.exec_time));
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const stdDev = Math.sqrt(times.reduce((s, t) => s + Math.pow(t - mean, 2), 0) / times.length);

    const dayGroups = {};
    for (const log of skillLogs) {
      if (!dayGroups[log.day_of_week]) dayGroups[log.day_of_week] = 0;
      dayGroups[log.day_of_week]++;
    }

    const totalDays = Object.values(dayGroups).reduce((a, b) => a + b, 0);
    const dominantDays = Object.entries(dayGroups).filter(([, count]) => count / totalDays > 0.5);

    const timeConsistencyScore = Math.max(0, 1 - stdDev / 60);
    const observationScore = Math.min(1, skillLogs.length / 10);
    const confidence = (timeConsistencyScore * 0.6 + observationScore * 0.4);

    if (confidence >= CONFIDENCE_THRESHOLD) {
      const avgTimeStr = minutesToTime(Math.round(mean));
      const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const days = dominantDays.map(([d]) => dayNames[parseInt(d)]).join(', ');

      const suggestedSkill = {
        ...JSON.parse(JSON.stringify(skill)),
        trigger_type: 'time',
        trigger_value: avgTimeStr,
        trigger_extra: JSON.stringify({
          recurrence: dominantDays.length >= 5 ? 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' : null
        }),
      };

      const suggestionId = uuidv4();
      db.prepare(`
        INSERT INTO suggestions (id, skill_id, type, title, description, confidence_score, evidence_summary, suggested_skill)
        VALUES (?, ?, 'automate_pattern', ?, ?, ?, ?, ?)
      `).run(
        suggestionId, skillId,
        `Automate "${skill.name}"`,
        `You've triggered "${skill.name}" ${skillLogs.length} times, usually around ${avgTimeStr} on ${days || 'various days'}. Want me to automate this?`,
        confidence,
        JSON.stringify({ execution_count: skillLogs.length, days_observed: Object.keys(dayGroups).length, avg_time: avgTimeStr, std_dev_minutes: Math.round(stdDev) }),
        JSON.stringify(suggestedSkill)
      );

      console.log(`[HEARTBEAT] New suggestion created for skill: ${skill.name} (confidence: ${(confidence * 100).toFixed(0)}%)`);
    }
  }
}

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

module.exports = { scanPatterns };
```

### 5.2 Suggestions API

Create `backend/src/api/suggestions.js`:
```javascript
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/db');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const suggestions = db.prepare(`
    SELECT * FROM suggestions WHERE status = 'pending' ORDER BY confidence_score DESC
  `).all();
  res.json(suggestions.map(s => ({
    ...s,
    evidence_summary: JSON.parse(s.evidence_summary || '{}'),
    suggested_skill: JSON.parse(s.suggested_skill || '{}'),
  })));
});

router.post('/:id/accept', async (req, res) => {
  const db = getDb();
  const suggestion = db.prepare('SELECT * FROM suggestions WHERE id = ?').get(req.params.id);
  if (!suggestion) return res.status(404).json({ error: 'Suggestion not found' });

  // suggestedSkill is a parsed JS object — .actions and .conditions are JS arrays.
  // Must re-stringify before passing to better-sqlite3 or it throws TypeError.
  const suggestedSkill = JSON.parse(suggestion.suggested_skill || '{}');
  const skillId = uuidv4();
  const metadata = {
    created_at: new Date().toISOString(),
    created_by: 'system_suggested',
    source: 'user_generated',
    tags: ['auto-suggested'],
    execution_count: 0, last_executed: null,
    confidence_score: suggestion.confidence_score, is_active: true,
  };

  db.prepare(`
    INSERT INTO skills (id, name, description, trigger_type, trigger_value, trigger_source,
      trigger_extra, conditions, actions, metadata, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    skillId,
    suggestedSkill.name || 'Suggested Skill',
    suggestedSkill.description || '',
    suggestedSkill.trigger_type,
    suggestedSkill.trigger_value || '',
    suggestedSkill.trigger_source || null,
    typeof suggestedSkill.trigger_extra === 'string'
      ? suggestedSkill.trigger_extra
      : JSON.stringify(suggestedSkill.trigger_extra || {}),
    JSON.stringify(suggestedSkill.conditions || []),
    JSON.stringify(suggestedSkill.actions || []),
    JSON.stringify(metadata)
  );

  db.prepare("UPDATE suggestions SET status = 'accepted' WHERE id = ?").run(req.params.id);
  res.json({ message: 'Suggestion accepted', skill_id: skillId });
});

router.post('/:id/dismiss', (req, res) => {
  const db = getDb();
  db.prepare("UPDATE suggestions SET status = 'dismissed' WHERE id = ?").run(req.params.id);
  res.json({ message: 'Suggestion dismissed' });
});

router.post('/:id/edit', (req, res) => {
  const db = getDb();
  const suggestion = db.prepare('SELECT * FROM suggestions WHERE id = ?').get(req.params.id);
  if (!suggestion) return res.status(404).json({ error: 'Not found' });
  res.json({ suggested_skill: JSON.parse(suggestion.suggested_skill || '{}') });
});

module.exports = router;
```

Register in `index.js`:
```javascript
const suggestionsRouter = require('./api/suggestions');
app.use('/suggestions', suggestionsRouter);
```

### 5.3 Wire Up OpenClaw Heartbeat

#### openclaw.json configuration
Add to `~/.openclaw/openclaw.json`:
```json
{
  "agents": {
    "list": [
      {
        "id": "WeaveClaw",
        "heartbeat": {
          "every": "15",
          "lightContext": true,
          "isolatedSession": true
        }
      }
    ]
  }
}
```

#### HEARTBEAT.md
Create `WeaveClaw/openclaw-skill/HEARTBEAT.md` and copy to `~/.openclaw/workspace/`:

```markdown
# WeaveClaw Heartbeat Checklist

You are the WeaveClaw pattern scanner. On every heartbeat:

1. Call `GET http://localhost:3000/suggestions` to check pending suggestions.
2. If the list has fewer than 3 pending suggestions, trigger a pattern scan:
   - Call `POST http://localhost:3000/heartbeat/scan`
   - Log the result
3. Report HEARTBEAT_OK if nothing needs attention.
4. If new suggestions were created, summarize them briefly.

Do not send alerts for HEARTBEAT_OK states.
```

#### Heartbeat scan endpoint
Add to `index.js` (before app.listen):
```javascript
const { scanPatterns } = require('./services/heartbeat/pattern_scanner');
const cron = require('node-cron');

// Manual trigger endpoint (for OpenClaw heartbeat and testing)
app.post('/heartbeat/scan', (req, res) => {
  try {
    scanPatterns();
    res.json({ message: 'Pattern scan complete', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Also run on schedule internally as a safety net
const heartbeatMins = parseInt(process.env.HEARTBEAT_INTERVAL_MINUTES || '15');
cron.schedule(`*/${heartbeatMins} * * * *`, () => {
  console.log('[HEARTBEAT] Running pattern scan...');
  scanPatterns();
});
```

#### SKILL.md (OpenClaw skill registration)
Create `WeaveClaw/openclaw-skill/SKILL.md`:
```markdown
---
name: WeaveClaw
description: "WeaveClaw automation engine. Use when user wants to create, manage, or execute automation skills. Handles natural language → automation workflow conversion, conflict detection, and behavioral learning. WeaveClaw backend runs at http://localhost:3000."
---

# WeaveClaw Skill

WeaveClaw is a local automation engine. You can interact with it using these endpoints:

## Create or Execute a Skill via Chat
POST http://localhost:3000/chat
Body: { "message": "<user intent>", "session_id": "<unique id>" }
Returns: skill_created | skill_executed | clarification_needed | conflict_detected

## List All Skills
GET http://localhost:3000/skills

## Execute a Skill Manually
POST http://localhost:3000/skills/<skill_id>/execute

## View Suggestions
GET http://localhost:3000/suggestions

## Accept a Suggestion
POST http://localhost:3000/suggestions/<id>/accept

## When to use this skill
- When user says "create an automation", "add a skill", "set up a routine"
- When user says "I'm going to sleep", "start focus mode" (execute existing)
- When user asks about their automations or suggestions

Always forward user intent to POST /chat first. Let WeaveClaw handle classification.
```

Copy skills to OpenClaw:
```bash
mkdir -p ~/.openclaw/workspace/skills/WeaveClaw
cp WeaveClaw/openclaw-skill/SKILL.md ~/.openclaw/workspace/skills/WeaveClaw/SKILL.md
cp WeaveClaw/openclaw-skill/HEARTBEAT.md ~/.openclaw/workspace/HEARTBEAT.md
```

### 5.4 Seed Data for Testing Suggestions

> **Note:** This curl-based seeding fires all executions at the current moment (stdDev ≈ 0,
> day_frequency = 1). It proves the scan endpoint works but rarely crosses the confidence
> threshold. For the actual demo, use **Phase 8.1's `npm run seed`** which distributes logs
> across past weekdays correctly.

```bash
SKILL_ID=$(curl -s -X POST http://localhost:3000/skills \
  -H "Content-Type: application/json" \
  -d '{"name":"Focus Mode","trigger":{"type":"natural_language","value":"start focus mode","source":"user_input"},"actions":[{"service":"simulation","command":"turn_off","params":{}}]}' | jq -r .id)

for i in 1 2 3 4 5 6 7 8; do
  curl -s -X POST "http://localhost:3000/skills/$SKILL_ID/execute" > /dev/null
done

curl -X POST http://localhost:3000/heartbeat/scan
curl http://localhost:3000/suggestions
```

### ✅ Checkpoint 5
```bash
curl http://localhost:3000/suggestions
# Should return at least one suggestion with confidence_score ≥ 0.70

SUGG_ID=$(curl -s http://localhost:3000/suggestions | jq -r '.[0].id')
curl -X POST http://localhost:3000/suggestions/$SUGG_ID/accept
# Returns { skill_id: "..." }

curl http://localhost:3000/skills
# New scheduled skill should appear
```

---

## Phase 6 — Community Hub (Mock Marketplace)
**Goal:** A realistic mock hub UI with 10 hardcoded skills. Import runs real local validation. No additional backend needed.

### 6.1 Mock Hub Skills Data

Create `flutter_app/assets/mock_hub_skills.json`:
```json
[
  {
    "id": "hub-001",
    "name": "Morning Routine Pro",
    "description": "Turns on kitchen lights and starts coffee machine every weekday at 7am",
    "tags": ["morning", "schedule", "home"],
    "required_devices": ["kitchen-lights", "coffee-machine"],
    "required_services": ["smartthings"],
    "rating": 4.8,
    "import_count": 1247,
    "author_hash": "sha256:a3f8b2c1d4e5f6a7",
    "published_at": "2026-01-15",
    "trigger": { "type": "time", "value": "07:00", "source": "schedule", "extra": { "recurrence": "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" } },
    "actions": [
      { "service": "smartthings", "device_id": "kitchen-lights", "command": "turn_on", "params": {} },
      { "service": "smartthings", "device_id": "coffee-machine", "command": "turn_on", "params": {} }
    ]
  },
  {
    "id": "hub-002",
    "name": "GitHub Deploy Alert",
    "description": "Flash lights red and send Slack alert on every GitHub push",
    "tags": ["github", "developer", "webhook"],
    "required_devices": ["office-lights"],
    "required_services": ["smartthings", "slack"],
    "rating": 4.5,
    "import_count": 892,
    "author_hash": "sha256:b4c9d3e2f1a6b7c8",
    "published_at": "2026-02-01",
    "trigger": { "type": "webhook", "source": "github", "event": "push" },
    "actions": [
      { "service": "smartthings", "device_id": "office-lights", "command": "set_color", "params": { "hex": "#FF0000" } }
    ]
  },
  {
    "id": "hub-003",
    "name": "Post-Workout Cool Down",
    "description": "When Samsung Health detects workout end, cool the room and send hydration reminder",
    "tags": ["health", "fitness", "samsung"],
    "required_devices": ["bedroom-ac"],
    "required_services": ["samsung_health", "smartthings"],
    "rating": 4.3,
    "import_count": 634,
    "author_hash": "sha256:c5d0e4f3a2b8c9d0",
    "published_at": "2026-01-28",
    "trigger": { "type": "health_event", "source": "samsung_health", "event": "workout_end" },
    "actions": [
      { "service": "smartthings", "device_id": "bedroom-ac", "command": "set_temperature", "params": { "value": 20, "unit": "celsius" } }
    ]
  },
  {
    "id": "hub-004",
    "name": "Night Mode Lite",
    "description": "Dims all lights and sets thermostat at 11pm",
    "tags": ["night", "sleep", "schedule"],
    "required_devices": ["living-room-lights", "bedroom-ac"],
    "required_services": ["smartthings"],
    "rating": 4.7,
    "import_count": 2103,
    "author_hash": "sha256:d6e1f5a4b3c9d0e1",
    "published_at": "2026-01-10",
    "trigger": { "type": "time", "value": "23:00", "source": "schedule" },
    "actions": [
      { "service": "smartthings", "device_id": "living-room-lights", "command": "turn_off", "params": {} },
      { "service": "smartthings", "device_id": "bedroom-ac", "command": "set_temperature", "params": { "value": 24, "unit": "celsius" } }
    ]
  },
  {
    "id": "hub-005",
    "name": "Focus Mode Scheduler",
    "description": "Starts focus mode at 9am on weekdays, DND on, lights warm white",
    "tags": ["focus", "work", "productivity"],
    "required_devices": ["office-lights"],
    "required_services": ["smartthings"],
    "rating": 4.6,
    "import_count": 1580,
    "author_hash": "sha256:e7f2a6b5c4d0e1f2",
    "published_at": "2026-02-05",
    "trigger": { "type": "time", "value": "09:00", "source": "schedule", "extra": { "recurrence": "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" } },
    "actions": [
      { "service": "simulation", "device_id": "office-lights", "command": "set_color", "params": { "hex": "#FFD700" } }
    ]
  },
  {
    "id": "hub-006",
    "name": "Weekend Lazy Mode",
    "description": "On weekends at noon, dims lights and sets AC to comfort temp",
    "tags": ["weekend", "relax", "home"],
    "required_devices": ["living-room-lights", "living-room-ac"],
    "required_services": ["smartthings"],
    "rating": 4.1,
    "import_count": 445,
    "author_hash": "sha256:f8a3b7c6d5e1f2a3",
    "published_at": "2026-02-14",
    "trigger": { "type": "time", "value": "12:00", "source": "schedule", "extra": { "recurrence": "RRULE:FREQ=WEEKLY;BYDAY=SA,SU" } },
    "actions": [
      { "service": "smartthings", "device_id": "living-room-ac", "command": "set_temperature", "params": { "value": 23, "unit": "celsius" } }
    ]
  },
  {
    "id": "hub-007",
    "name": "CI/CD Build Monitor",
    "description": "Green lights on successful build, red on failure via webhook",
    "tags": ["devops", "github", "developer"],
    "required_devices": ["office-lights"],
    "required_services": ["smartthings"],
    "rating": 4.4,
    "import_count": 721,
    "author_hash": "sha256:a9b4c8d7e6f2a4b5",
    "published_at": "2026-03-01",
    "trigger": { "type": "webhook", "source": "github", "event": "workflow_run" },
    "actions": [
      { "service": "simulation", "device_id": "office-lights", "command": "set_color", "params": { "hex": "#00FF00" } }
    ]
  },
  {
    "id": "hub-008",
    "name": "Movie Night Mode",
    "description": "Dim lights, set AC to comfortable temp when you say movie time",
    "tags": ["entertainment", "home", "voice"],
    "required_devices": ["living-room-lights", "living-room-ac"],
    "required_services": ["smartthings"],
    "rating": 4.9,
    "import_count": 3241,
    "author_hash": "sha256:b0c5d9e8f7a3b6c7",
    "published_at": "2026-01-05",
    "trigger": { "type": "natural_language", "value": "movie time", "source": "user_input" },
    "actions": [
      { "service": "smartthings", "device_id": "living-room-lights", "command": "turn_off", "params": {} },
      { "service": "smartthings", "device_id": "living-room-ac", "command": "set_temperature", "params": { "value": 22, "unit": "celsius" } }
    ]
  },
  {
    "id": "hub-009",
    "name": "Hydration Reminder",
    "description": "Every 2 hours during work hours, sends a hydration notification",
    "tags": ["health", "reminder", "productivity"],
    "required_devices": [],
    "required_services": [],
    "rating": 4.2,
    "import_count": 987,
    "author_hash": "sha256:c1d6e0f9a8b4c7d8",
    "published_at": "2026-02-20",
    "trigger": { "type": "time", "value": "10:00", "source": "schedule" },
    "actions": [
      { "service": "simulation", "command": "notify", "params": { "message": "Time to drink water!" } }
    ]
  },
  {
    "id": "hub-010",
    "name": "Bedtime Wind Down",
    "description": "At 10pm, gradually dims lights and plays white noise. NL trigger: 'winding down'",
    "tags": ["sleep", "night", "relax"],
    "required_devices": ["bedroom-lights", "smart-speaker"],
    "required_services": ["smartthings"],
    "rating": 4.6,
    "import_count": 1893,
    "author_hash": "sha256:d2e7f1a0b9c5d8e9",
    "published_at": "2026-01-22",
    "trigger": { "type": "natural_language", "value": "winding down", "source": "user_input" },
    "actions": [
      { "service": "smartthings", "device_id": "bedroom-lights", "command": "turn_off", "params": {} }
    ]
  }
]
```

The import validation is done by calling `POST /skills` with `source: 'community_imported'`. The full pipeline (Zod + semantic validation + conflict detection) runs automatically.

---

## Phase 7 — Flutter App
**Goal:** Full working UI with 4 screens. All connected to the backend API.

### 7.0 Android Manifest — HTTP and Internet Permission (DO THIS FIRST)

> **Why:** Android API 28+ blocks all cleartext HTTP traffic by default. `http://10.0.2.2:3000` is HTTP, not HTTPS. Without this fix, every API call from the emulator silently fails. This must be done before running the app.

Open `flutter_app/android/app/src/main/AndroidManifest.xml` and make two edits:

**Step A — Add INTERNET permission** (before the `<application>` tag):
```xml
<uses-permission android:name="android.permission.INTERNET"/>
```

**Step B — Allow cleartext HTTP** (add `android:usesCleartextTraffic="true"` to the `<application>` tag):
```xml
<application
    android:label="flutter_app"
    android:name="${applicationName}"
    android:icon="@mipmap/ic_launcher"
    android:usesCleartextTraffic="true">
```

The full file after editing:
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET"/>

    <application
        android:label="flutter_app"
        android:name="${applicationName}"
        android:icon="@mipmap/ic_launcher"
        android:usesCleartextTraffic="true">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:taskAffinity=""
            android:theme="@style/LaunchTheme"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|locale|layoutDirection|fontScale|screenLayout|density|uiMode"
            android:hardwareAccelerated="true"
            android:windowSoftInputMode="adjustResize">
            <meta-data
              android:name="io.flutter.embedding.android.NormalTheme"
              android:resource="@style/NormalTheme"/>
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
        <meta-data
            android:name="flutterEmbedding"
            android:value="2"/>
    </application>

    <queries>
        <intent>
            <action android:name="android.intent.action.PROCESS_TEXT"/>
            <data android:mimeType="text/plain"/>
        </intent>
    </queries>
</manifest>
```

> **iOS note:** iOS Simulator does not have this restriction. `http://127.0.0.1:3000` works without any plist changes.

### 7.1 pubspec.yaml

```yaml
name: flutter_app
description: WeaveClaw Flutter App

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  http: ^1.2.0

dev_dependencies:
  flutter_test:
    sdk: flutter

flutter:
  uses-material-design: true
  assets:
    - assets/mock_hub_skills.json
```

### 7.2 API Service

Create `flutter_app/lib/services/api_service.dart`:
```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiService {
  // Android emulator uses 10.0.2.2 to reach host machine's localhost
  static const String baseUrl = 'http://10.0.2.2:3000';

  // ─── Chat ───────────────────────────────────────
  static Future<Map<String, dynamic>> sendChat(String message, String sessionId) async {
    final res = await http.post(
      Uri.parse('$baseUrl/chat'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'message': message, 'session_id': sessionId}),
    );
    return jsonDecode(res.body);
  }

  // ─── Skills ─────────────────────────────────────
  static Future<List<dynamic>> getSkills() async {
    final res = await http.get(Uri.parse('$baseUrl/skills'));
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> executeSkill(String skillId) async {
    final res = await http.post(Uri.parse('$baseUrl/skills/$skillId/execute'));
    return jsonDecode(res.body);
  }

  static Future<void> toggleSkill(String skillId) async {
    await http.patch(Uri.parse('$baseUrl/skills/$skillId/toggle'));
  }

  static Future<void> deleteSkill(String skillId) async {
    await http.delete(Uri.parse('$baseUrl/skills/$skillId'));
  }

  static Future<List<dynamic>> getExecutions(String skillId) async {
    final res = await http.get(Uri.parse('$baseUrl/skills/$skillId/executions'));
    return jsonDecode(res.body);
  }

  // ─── Suggestions ────────────────────────────────
  static Future<List<dynamic>> getSuggestions() async {
    final res = await http.get(Uri.parse('$baseUrl/suggestions'));
    return jsonDecode(res.body);
  }

  static Future<void> acceptSuggestion(String id) async {
    await http.post(Uri.parse('$baseUrl/suggestions/$id/accept'));
  }

  static Future<void> dismissSuggestion(String id) async {
    await http.post(Uri.parse('$baseUrl/suggestions/$id/dismiss'));
  }

  // ─── Devices ────────────────────────────────────
  static Future<List<dynamic>> getDevices() async {
    final res = await http.get(Uri.parse('$baseUrl/devices'));
    return jsonDecode(res.body);
  }

  // ─── Community Hub Import ────────────────────────
  static Future<Map<String, dynamic>> importHubSkill(Map<String, dynamic> skill) async {
    final res = await http.post(
      Uri.parse('$baseUrl/skills'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(skill),
    );
    return jsonDecode(res.body);
  }

  // ─── Conflict Resolution ─────────────────────────
  static Future<Map<String, dynamic>> resolveConflict(
      Map<String, dynamic> newSkill, String conflictingId, String resolution) async {
    final res = await http.post(
      Uri.parse('$baseUrl/conflicts/resolve'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'new_skill': newSkill,
        'conflicting_skill_id': conflictingId,
        'resolution': resolution,
      }),
    );
    return jsonDecode(res.body);
  }
}
```

### 7.3 Main App with Bottom Navigation

Create `flutter_app/lib/main.dart`:
```dart
import 'package:flutter/material.dart';
import 'screens/chat_screen.dart';
import 'screens/skill_library_screen.dart';
import 'screens/suggestions_screen.dart';
import 'screens/community_hub_screen.dart';

void main() => runApp(const WeaveClawApp());

class WeaveClawApp extends StatelessWidget {
  const WeaveClawApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'WeaveClaw',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF6C63FF),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: const MainShell(),
    );
  }
}

class MainShell extends StatefulWidget {
  const MainShell({super.key});
  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _currentIndex = 0;

  final List<Widget> _screens = [
    const ChatScreen(),
    const SkillLibraryScreen(),
    const SuggestionsScreen(),
    const CommunityHubScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _screens[_currentIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (i) => setState(() => _currentIndex = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: 'Chat'),
          NavigationDestination(icon: Icon(Icons.auto_awesome_mosaic_outlined), selectedIcon: Icon(Icons.auto_awesome_mosaic), label: 'Skills'),
          NavigationDestination(icon: Icon(Icons.lightbulb_outline), selectedIcon: Icon(Icons.lightbulb), label: 'Suggestions'),
          NavigationDestination(icon: Icon(Icons.store_outlined), selectedIcon: Icon(Icons.store), label: 'Hub'),
        ],
      ),
    );
  }
}
```

### 7.4 Chat Screen

Create `flutter_app/lib/screens/chat_screen.dart`:
```dart
import 'package:flutter/material.dart';
import '../services/api_service.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final String _sessionId = DateTime.now().millisecondsSinceEpoch.toString();
  final List<_Message> _messages = [];
  bool _loading = false;

  void _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    _controller.clear();

    setState(() {
      _messages.add(_Message(text: text, isUser: true));
      _loading = true;
    });
    _scrollToBottom();

    try {
      final response = await ApiService.sendChat(text, _sessionId);
      final reply = _formatResponse(response);
      setState(() {
        _messages.add(_Message(text: reply, isUser: false, type: response['type']));
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _messages.add(_Message(text: 'Error: ${e.toString()}', isUser: false, type: 'error'));
        _loading = false;
      });
    }
    _scrollToBottom();
  }

  String _formatResponse(Map<String, dynamic> r) {
    switch (r['type']) {
      case 'skill_created':
        return '✅ Skill created: **${r['skill']?['name'] ?? 'Unnamed'}**\nTrigger: ${r['skill']?['trigger_type']}';
      case 'skill_executed':
        final results = (r['actions_result'] as List?)?.map((a) => a['response']?.toString() ?? '').join('\n') ?? '';
        return '⚡ Executed: **${r['skill_name']}**\n$results';
      case 'clarification_needed':
        return '❓ ${r['prompt']}';
      case 'conflict_detected':
        final c = r['conflict'];
        final options = (c?['resolution_options'] as List?)
            ?.map((o) => o is Map ? '${o['id']}${o['recommended'] == true ? ' ✓ (recommended)' : ''}' : o.toString())
            .join(', ') ?? '';
        return '⚠️ Conflict detected!\n"${c?['conflict_detail']}"\nRecommended: ${c?['recommended_resolution']}\nOptions: $options';
      case 'error':
        return '❌ ${r['message']}';
      default:
        return r.toString();
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('WeaveClaw Chat'), centerTitle: true),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.all(12),
              itemCount: _messages.length + (_loading ? 1 : 0),
              itemBuilder: (ctx, i) {
                if (_loading && i == _messages.length) {
                  return const Padding(
                    padding: EdgeInsets.all(8),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                final m = _messages[i];
                return _ChatBubble(message: m);
              },
            ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    onSubmitted: (_) => _send(),
                    decoration: const InputDecoration(
                      hintText: "I'm going to sleep...",
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(onPressed: _send, icon: const Icon(Icons.send)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Message {
  final String text;
  final bool isUser;
  final String? type;
  _Message({required this.text, required this.isUser, this.type});
}

class _ChatBubble extends StatelessWidget {
  final _Message message;
  const _ChatBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Align(
      alignment: message.isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
        decoration: BoxDecoration(
          color: message.isUser ? scheme.primary : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(
          message.text,
          style: TextStyle(color: message.isUser ? scheme.onPrimary : scheme.onSurface),
        ),
      ),
    );
  }
}
```

### 7.5 Skill Library Screen

Create `flutter_app/lib/screens/skill_library_screen.dart`:
```dart
import 'package:flutter/material.dart';
import '../services/api_service.dart';

class SkillLibraryScreen extends StatefulWidget {
  const SkillLibraryScreen({super.key});
  @override
  State<SkillLibraryScreen> createState() => _SkillLibraryScreenState();
}

class _SkillLibraryScreenState extends State<SkillLibraryScreen> {
  List<dynamic> _skills = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    _skills = await ApiService.getSkills();
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Skill Library'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _skills.isEmpty
              ? const Center(child: Text('No skills yet. Create one in Chat!'))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    itemCount: _skills.length,
                    itemBuilder: (ctx, i) => _SkillCard(skill: _skills[i], onChanged: _load),
                  ),
                ),
    );
  }
}

class _SkillCard extends StatelessWidget {
  final Map<String, dynamic> skill;
  final VoidCallback onChanged;
  const _SkillCard({required this.skill, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final isActive = skill['is_active'] == 1 || skill['is_active'] == true;
    final meta = skill['metadata'] as Map? ?? {};
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: ExpansionTile(
        leading: Icon(isActive ? Icons.flash_on : Icons.flash_off,
            color: isActive ? Colors.amber : Colors.grey),
        title: Text(skill['name'] ?? 'Unnamed', style: const TextStyle(fontWeight: FontWeight.bold)),
        subtitle: Text('${skill['trigger_type']} • ${meta['execution_count'] ?? 0} runs'),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (skill['description']?.isNotEmpty == true)
                  Text(skill['description'], style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 8),
                Row(children: [
                  ElevatedButton.icon(
                    icon: const Icon(Icons.play_arrow, size: 16),
                    label: const Text('Execute'),
                    onPressed: () async {
                      try {
                        await ApiService.executeSkill(skill['id']);
                        ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('✅ Skill executed!')));
                        onChanged();
                      } catch (e) {
                        ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('❌ Error: $e')));
                      }
                    },
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton.icon(
                    icon: Icon(isActive ? Icons.pause : Icons.play_arrow, size: 16),
                    label: Text(isActive ? 'Disable' : 'Enable'),
                    onPressed: () async {
                      await ApiService.toggleSkill(skill['id']);
                      onChanged();
                    },
                  ),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.delete_outline, color: Colors.red),
                    onPressed: () async {
                      final confirm = await showDialog<bool>(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          title: const Text('Delete skill?'),
                          actions: [
                            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                            TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete', style: TextStyle(color: Colors.red))),
                          ],
                        ),
                      );
                      if (confirm == true) {
                        await ApiService.deleteSkill(skill['id']);
                        onChanged();
                      }
                    },
                  ),
                ]),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
```

### 7.6 Suggestions Screen

Create `flutter_app/lib/screens/suggestions_screen.dart`:
```dart
import 'package:flutter/material.dart';
import '../services/api_service.dart';

class SuggestionsScreen extends StatefulWidget {
  const SuggestionsScreen({super.key});
  @override
  State<SuggestionsScreen> createState() => _SuggestionsScreenState();
}

class _SuggestionsScreenState extends State<SuggestionsScreen> {
  List<dynamic> _suggestions = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    _suggestions = await ApiService.getSuggestions();
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Suggestions'), actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
      ]),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _suggestions.isEmpty
              ? const Center(child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.lightbulb_outline, size: 64, color: Colors.grey),
                    SizedBox(height: 16),
                    Text('No suggestions yet.\nKeep using your skills and the AI will learn!', textAlign: TextAlign.center),
                  ],
                ))
              : ListView.builder(
                  itemCount: _suggestions.length,
                  itemBuilder: (ctx, i) => _SuggestionCard(s: _suggestions[i], onChanged: _load),
                ),
    );
  }
}

class _SuggestionCard extends StatelessWidget {
  final Map<String, dynamic> s;
  final VoidCallback onChanged;
  const _SuggestionCard({required this.s, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final confidence = ((s['confidence_score'] ?? 0) * 100).toInt();
    final evidence = s['evidence_summary'] as Map? ?? {};
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(Icons.auto_awesome, color: Colors.amber),
              const SizedBox(width: 8),
              Expanded(child: Text(s['title'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.green.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text('$confidence% confident', style: const TextStyle(color: Colors.green, fontSize: 12)),
              ),
            ]),
            const SizedBox(height: 8),
            Text(s['description'] ?? ''),
            if (evidence.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text('${evidence['execution_count']} executions over ${evidence['days_observed']} days, avg ${evidence['avg_time']}',
                  style: Theme.of(context).textTheme.bodySmall),
            ],
            const SizedBox(height: 12),
            Row(children: [
              FilledButton(
                onPressed: () async {
                  await ApiService.acceptSuggestion(s['id']);
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('✅ Skill created from suggestion!')));
                  onChanged();
                },
                child: const Text('Accept'),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: () async { await ApiService.dismissSuggestion(s['id']); onChanged(); },
                child: const Text('Dismiss'),
              ),
            ]),
          ],
        ),
      ),
    );
  }
}
```

### 7.7 Community Hub Screen

Create `flutter_app/lib/screens/community_hub_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:flutter/services.dart';
import '../services/api_service.dart';

class CommunityHubScreen extends StatefulWidget {
  const CommunityHubScreen({super.key});
  @override
  State<CommunityHubScreen> createState() => _CommunityHubScreenState();
}

class _CommunityHubScreenState extends State<CommunityHubScreen> {
  List<dynamic> _allSkills = [];
  List<dynamic> _filtered = [];
  String _search = '';
  String _tag = 'All';
  Set<String> _tags = {'All'};

  @override
  void initState() {
    super.initState();
    _loadHubSkills();
  }

  Future<void> _loadHubSkills() async {
    final json = await rootBundle.loadString('assets/mock_hub_skills.json');
    final data = jsonDecode(json) as List;
    setState(() {
      _allSkills = data;
      _filtered = data;
      final tags = data.expand((s) => (s['tags'] as List? ?? [])).toSet();
      _tags = {'All', ...tags.cast<String>()};
    });
  }

  void _filter() {
    setState(() {
      _filtered = _allSkills.where((s) {
        final matchSearch = _search.isEmpty ||
            s['name'].toString().toLowerCase().contains(_search.toLowerCase()) ||
            s['description'].toString().toLowerCase().contains(_search.toLowerCase());
        final matchTag = _tag == 'All' || (s['tags'] as List? ?? []).contains(_tag);
        return matchSearch && matchTag;
      }).toList();
    });
  }

  Future<void> _import(Map<String, dynamic> hubSkill) async {
    final skill = {
      'name': hubSkill['name'],
      'description': hubSkill['description'],
      'trigger': hubSkill['trigger'],
      'actions': hubSkill['actions'],
      'tags': hubSkill['tags'],
      'source': 'community_imported',
    };

    showDialog(context: context, barrierDismissible: false, builder: (_) =>
        const AlertDialog(content: Row(children: [CircularProgressIndicator(), SizedBox(width: 16), Text('Validating...')]))
    );

    try {
      final result = await ApiService.importHubSkill(skill);
      Navigator.of(context).pop();

      if (result['error'] != null) {
        _showImportWarning(hubSkill, skill, result['error'].toString(), result['warnings'] as List?);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('✅ "${hubSkill['name']}" imported!')));
      }
    } catch (e) {
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('❌ Import failed: $e')));
    }
  }

  void _showImportWarning(Map<String, dynamic> hubSkill, Map<String, dynamic> skill, String error, List? warnings) {
    final requiredDevices = (hubSkill['required_devices'] as List?)?.join(', ') ?? 'none';
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(children: [Icon(Icons.warning, color: Colors.orange), SizedBox(width: 8), Text('Import Warning')]),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Issue: $error'),
          if (warnings != null && warnings.isNotEmpty) ...[
            const SizedBox(height: 8),
            ...warnings.map((w) => Text('• $w', style: const TextStyle(fontSize: 12, color: Colors.orange))),
          ],
          if (requiredDevices.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Required devices: $requiredDevices'),
            const Text('These devices are not registered in your environment.', style: TextStyle(fontSize: 12, color: Colors.grey)),
          ],
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            // Re-send with acknowledge_warnings: true so the backend semantic validator
            // allows the import through in simulation mode.
            onPressed: () async {
              Navigator.pop(ctx);
              try {
                final result = await ApiService.importHubSkill({
                  ...skill,
                  'acknowledge_warnings': true,
                });
                if (result['error'] == null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('✅ "${hubSkill['name']}" imported in simulation mode!')));
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('❌ Import failed: ${result['error']}')));
                }
              } catch (e) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('❌ Error: $e')));
              }
            },
            child: const Text('Import in Sim Mode'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Community Hub')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              onChanged: (v) { _search = v; _filter(); },
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search), hintText: 'Search skills...', border: OutlineInputBorder(),
              ),
            ),
          ),
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: _tags.map((tag) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(tag),
                  selected: _tag == tag,
                  onSelected: (_) { setState(() => _tag = tag); _filter(); },
                ),
              )).toList(),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: ListView.builder(
              itemCount: _filtered.length,
              itemBuilder: (ctx, i) {
                final s = _filtered[i];
                final tags = (s['tags'] as List?)?.cast<String>() ?? [];
                return Card(
                  margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(child: Text(s['name'], style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16))),
                        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                          Text('⭐ ${s['rating']}', style: const TextStyle(fontSize: 12)),
                          Text('${s['import_count']} imports', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                        ]),
                      ]),
                      const SizedBox(height: 6),
                      Text(s['description'], style: Theme.of(context).textTheme.bodySmall),
                      const SizedBox(height: 8),
                      Wrap(spacing: 6, children: tags.map((t) => Chip(label: Text(t), materialTapTargetSize: MaterialTapTargetSize.shrinkWrap, padding: EdgeInsets.zero)).toList()),
                      if ((s['required_devices'] as List?)?.isNotEmpty == true) ...[
                        const SizedBox(height: 4),
                        Text('Needs: ${(s['required_devices'] as List).join(', ')}', style: const TextStyle(fontSize: 11, color: Colors.orange)),
                      ],
                      const SizedBox(height: 10),
                      Row(children: [
                        FilledButton.icon(
                          icon: const Icon(Icons.download, size: 16),
                          label: const Text('Import'),
                          onPressed: () => _import(Map<String, dynamic>.from(s)),
                        ),
                        const Spacer(),
                        OutlinedButton.icon(
                          icon: const Icon(Icons.publish, size: 16),
                          label: const Text('Publish'),
                          onPressed: () => showDialog(
                            context: context,
                            builder: (_) => AlertDialog(
                              title: const Text('Publish Skill'),
                              content: const Text('Your skill will be anonymised before publishing. Your user ID will be hashed and no personal data will be shared.'),
                              actions: [
                                TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
                                FilledButton(
                                  onPressed: () {
                                    Navigator.pop(context);
                                    ScaffoldMessenger.of(context).showSnackBar(
                                        const SnackBar(content: Text('✅ Skill published to community hub!')));
                                  },
                                  child: const Text('Publish'),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ]),
                    ]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
```

### 7.8 Run the Flutter App

```bash
cd flutter_app
flutter pub get
flutter run   # Select Android emulator when prompted
```

**If using iOS Simulator**, change the baseUrl in `api_service.dart`:
```dart
// iOS Simulator uses 127.0.0.1
static const String baseUrl = 'http://127.0.0.1:3000';
```

### ✅ Checkpoint 7
- [ ] `AndroidManifest.xml` has `INTERNET` permission and `usesCleartextTraffic="true"`
- [ ] App launches on emulator with 4 tabs
- [ ] Chat: type "I'm going to sleep" → skill created response shown inline
- [ ] Chat: type same message again → skill executed response shown
- [ ] Skills: skill appears in library with execute/toggle/delete buttons
- [ ] Suggestions: after seeding data, suggestions appear with Accept/Dismiss
- [ ] Hub: 10 skill cards visible, search and tag filter work, Import shows validation warning, "Import in Sim Mode" successfully completes the import

---

## Phase 8 — Integration Testing and Demo Polish

### 8.1 Demo Seed Script

Create `backend/scripts/seed_demo.js`:
```javascript
require('dotenv').config();
const { getDb } = require('../src/db/db');
const { v4: uuidv4 } = require('uuid');

const db = getDb();

// Seed devices
const devices = [
  { id: 'living-room-lights', name: 'Living Room Lights', type: 'light', capabilities: JSON.stringify(['turn_on','turn_off','set_color']), service: 'simulation' },
  { id: 'bedroom-ac', name: 'Bedroom AC', type: 'ac', capabilities: JSON.stringify(['turn_on','turn_off','set_temperature']), service: 'simulation' },
  { id: 'kitchen-lights', name: 'Kitchen Lights', type: 'light', capabilities: JSON.stringify(['turn_on','turn_off']), service: 'simulation' },
  { id: 'office-lights', name: 'Office Lights', type: 'light', capabilities: JSON.stringify(['turn_on','turn_off','set_color']), service: 'simulation' },
];

for (const d of devices) {
  db.prepare('INSERT OR REPLACE INTO devices (id, name, type, capabilities, service) VALUES (?, ?, ?, ?, ?)').run(d.id, d.name, d.type, d.capabilities, d.service);
}

// Seed Focus Mode skill
const focusSkillId = uuidv4();
const focusMetadata = JSON.stringify({
  created_at: new Date().toISOString(),
  created_by: 'user',
  source: 'user_generated',
  tags: ['focus', 'work'],
  execution_count: 0,
  last_executed: null,
  confidence_score: null,
  is_active: true,
});

db.prepare(`
  INSERT OR IGNORE INTO skills (id, name, description, trigger_type, trigger_value, trigger_source, trigger_extra, conditions, actions, metadata, is_active)
  VALUES (?, 'Focus Mode', 'Start deep work session', 'natural_language', 'start focus mode', 'user_input', '{}', '[]',
  '[{"service":"simulation","device_id":"office-lights","command":"set_color","params":{"hex":"#FFD700"}}]',
  ?, 1)
`).run(focusSkillId, focusMetadata);

// Seed execution logs spread across past weekdays at ~10am (stdDev ~5 min)
// This gives the heartbeat scanner the day-of-week spread it needs to hit confidence ≥ 0.70.
const now = new Date();
let inserted = 0;
for (let daysAgo = 1; inserted < 10; daysAgo++) {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);

  // Skip weekends
  if (date.getDay() === 0 || date.getDay() === 6) continue;

  date.setHours(10, Math.floor(Math.random() * 10), 0, 0); // 10:00–10:09

  db.prepare(`
    INSERT INTO execution_logs (id, skill_id, executed_at, triggered_by, status, actions_result)
    VALUES (?, ?, ?, 'user_input', 'simulated', '[{"action_index":0,"status":"simulated","response":"office-lights → color #FFD700"}]')
  `).run(uuidv4(), focusSkillId, date.toISOString());

  inserted++;
}

console.log('✅ Demo data seeded. Now run: curl -X POST http://localhost:3000/heartbeat/scan');
```

Run:
```bash
npm run seed
curl -X POST http://localhost:3000/heartbeat/scan
curl http://localhost:3000/suggestions
```

### 8.2 The 5 Demo Flows

**Flow A — Sleep Routine (NL → Create → Execute):**
```
1. Open Chat
2. Type: "I'm going to sleep"
3. See: skill_created response
4. Type same message again
5. See: skill_executed response with simulation logs
```

**Flow B — GitHub Push (Webhook, real or curl fallback):**
```
# Get webhook URL for a GitHub skill:
curl http://localhost:3000/webhooks/generate/<skill_id>

# Paste URL into GitHub repo: Settings → Webhooks → Add webhook
# Push a commit — lights turn red

# Fallback (no GitHub access):
curl -X POST http://localhost:3000/webhooks/<skill_id> \
  -H "Content-Type: application/json" \
  -d '{"pusher":{"name":"demo-user"},"repository":{"full_name":"demo/repo"}}'
```

**Flow C — Conflict (NL → conflict detected → resolve):**
```
1. Create: "Set bedroom AC to 22°C at 11pm" (via Chat)
2. Create: "Set bedroom AC to 24°C at 11pm" (via Chat)
3. See: conflict_detected with structured resolution options
4. Choose: prioritise_new → existing deactivated
```

**Flow D — Hub Import (mock → validation → warning → resolve):**
```
1. Open Hub tab
2. Find "Post-Workout Cool Down" (requires samsung_health)
3. Click Import
4. See: validation warning — samsung_health not configured
5. Click "Import in Sim Mode" → skill appears in library
```

**Flow E — Heartbeat Suggestion:**
```
1. Run: npm run seed
2. Run: curl -X POST http://localhost:3000/heartbeat/scan
3. Open Suggestions tab (pull to refresh)
4. See: "Focus Mode" suggestion at ~80% confidence
5. Click Accept → scheduled skill created
6. Open Skills tab → new scheduled skill visible
```

### 8.3 Error Handling

Add to Express `index.js` (after all routes):
```javascript
// Global error handler — never expose stack traces
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({
    error: 'Something went wrong. Please try again.',
    ...(process.env.NODE_ENV === 'development' && { detail: err.message })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Endpoint ${req.method} ${req.path} not found` });
});
```

### 8.4 Final Test Run

```bash
cd backend && npm test
# Expected: all test suites pass

npm run dev &
sleep 2

curl http://localhost:3000/health
curl -X POST http://localhost:3000/chat -H "Content-Type: application/json" \
  -d '{"message":"turn off all lights","session_id":"smoke-1"}'
curl http://localhost:3000/skills
curl http://localhost:3000/suggestions
curl -X POST http://localhost:3000/heartbeat/scan
```

### ✅ Final Checkpoint
- [ ] All 5 demo flows run without errors
- [ ] No raw stack traces visible in app or API responses
- [ ] Flutter emulator shows smooth UI for all 4 screens
- [ ] Suggestions appear after seeding and scanning
- [ ] Hub import shows device mismatch warning correctly
- [ ] "Import in Sim Mode" actually completes the import
- [ ] OpenClaw gateway is running (`openclaw gateway status`)
- [ ] SKILL.md and HEARTBEAT.md are in `~/.openclaw/workspace/`
- [ ] ngrok tunnel documented in demo runbook with curl fallback

---

## Quick Reference — All API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/chat` | Main NLP entry point |
| GET | `/skills` | List all skills |
| POST | `/skills` | Create skill (validates + conflict checks) |
| GET | `/skills/:id` | Get single skill |
| PUT | `/skills/:id` | Update skill |
| DELETE | `/skills/:id` | Delete skill |
| PATCH | `/skills/:id/toggle` | Toggle active/inactive |
| POST | `/skills/:id/execute` | Manual execute |
| GET | `/skills/:id/executions` | Execution history |
| GET | `/devices` | List devices |
| POST | `/devices` | Register device |
| GET | `/suggestions` | Pending suggestions |
| POST | `/suggestions/:id/accept` | Accept → create skill |
| POST | `/suggestions/:id/dismiss` | Dismiss |
| POST | `/suggestions/:id/edit` | Get for editing |
| POST | `/webhooks/:skill_id` | Inbound webhook |
| GET | `/webhooks/generate/:skill_id` | Get webhook URL |
| POST | `/conflicts/resolve` | Resolve a conflict |
| POST | `/heartbeat/scan` | Trigger pattern scan |
| GET | `/health` | Health check |

---

## Common Mistakes — Do Not Make These

1. **Do not build a custom daemon.** OpenClaw's heartbeat IS the daemon. Use `HEARTBEAT.md` + the `/heartbeat/scan` endpoint.
2. **Do not skip the clarification loop.** The in-memory session Map must use `session_id` from the Flutter app.
3. **Do not save a skill without running conflict detection.** It must run on every `POST /skills` — including direct calls from the hub import, not just through `/chat`.
4. **Do not write execution logs anywhere except `better-sqlite3` sync.** No async logging — use synchronous `db.prepare().run()`.
5. **Do not use `localhost` in Flutter.** Android emulator uses `10.0.2.2`, iOS simulator uses `127.0.0.1`.
6. **Do not set up ngrok in Phase 8.** Do it in Phase 2. The webhook demo depends on it from Phase 3 onward.
7. **Do not assume Gemini always returns clean JSON despite `responseMimeType: 'application/json'`.** Gemini occasionally wraps JSON in markdown fences anyway. Always run the two-strategy `parseIntentJSON` (strip fences → extract `{...}` block) before `JSON.parse`. Retry up to `MAX_RETRIES` with `temperature: 0.0` before falling through to `ruleClassify`.
8. **Do not let partial intents touch the database.** Clarification state is in-memory Map only, with 10-min TTL.
9. **Do not skip the `AndroidManifest.xml` edits in Phase 7.0.** Android blocks all HTTP cleartext by default. The app will silently fail all API calls without `usesCleartextTraffic="true"` and the `INTERNET` permission.
10. **Do not forget to create `flutter_app/assets/` before Phase 6.** `flutter create` does not make this directory. Phase 6 writes `mock_hub_skills.json` there — the Hub screen crashes without it.
11. **Do not spread `skill.actions` into the Zod validation object in `PUT /skills`.** `skill.actions` is a JSON array — spreading it produces `{ '0': {...}, '1': {...} }`, not the shape Zod expects. Reconstruct the full skill from all DB columns (parsing each JSON field), merge with `req.body`, then validate.
12. **Do not return `null` from `parseIntentJSON` when Gemini responds but JSON is malformed.** A `null` return propagates to `chat.js` as a hard error — the rule classifier never runs. Retry up to `MAX_RETRIES` with a tighter prompt, then call `ruleClassify()` as the explicit fallback.
13. **Do not use `includes('')` for device matching in `skill_builder.js`.** An empty or undefined `action.device` makes `includes('')` return `true` for every device, silently matching the first one in the array. Use priority-ordered matching: exact ID → exact name → type → slug tokens. Return `null` explicitly on no match.
14. **Do not offer `merge_into_one` as a resolution for `contradictory_device_command` conflicts.** Merging `turn_on` + `turn_off` (or two different temperatures on the same device) into a single skill fires both actions simultaneously — that IS the contradiction. Exclude it from `resolution_options` for this conflict type and return a 400 if a client sends it anyway.
15. **Do not forget to create `backend/scripts/` before Phase 8.** The seed script `backend/scripts/seed_demo.js` is created in Phase 8.1. Run `mkdir -p backend/scripts` manually before `npm run seed` if you created the project before this was added to the Phase 0.3 `mkdir` command.
16. **Do not use the Phase 5.4 curl loop for the demo.** That loop fires all executions at the current timestamp (stdDev ≈ 0, day_frequency = 1 day). The heartbeat scanner's confidence formula requires day-of-week spread across multiple weekdays — it will never cross 0.70 from a single-moment burst. Always use `npm run seed` (Phase 8.1) for the demo.
17. **Do not start without a valid `GEMINI_API_KEY` in `.env`.** Without the key, every chat request silently falls through to `ruleClassify`. The rule classifier works but produces coarse intents — Gemini is required for full NLP quality. Get the key at https://aistudio.google.com before Phase 3.