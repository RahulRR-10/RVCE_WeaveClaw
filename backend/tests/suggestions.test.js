const request = require('supertest');
const crypto = require('crypto');

process.env.DB_PATH = ':memory:';

const app = require('../src/index');
const { getDb } = require('../src/db/db');

function insertUserExecution(db, skillId, executedAt) {
  db.prepare(`
    INSERT INTO execution_logs (id, skill_id, executed_at, triggered_by, status, actions_result)
    VALUES (?, ?, ?, 'user_input', 'simulated', '[]')
  `).run(crypto.randomUUID(), skillId, executedAt);
}

describe('Heartbeat suggestions', () => {
  test('POST /heartbeat/scan creates an automation suggestion that can be accepted', async () => {
    const createRes = await request(app).post('/skills').send({
      name: 'Focus Mode',
      trigger: { type: 'natural_language', value: 'start focus mode', source: 'user_input' },
      actions: [{ service: 'simulation', device_id: 'office-lights', command: 'turn_on', params: {} }],
    });

    expect(createRes.status).toBe(201);

    const db = getDb();
    const base = new Date();
    let inserted = 0;
    for (let daysAgo = 1; inserted < 10; daysAgo++) {
      const date = new Date(base);
      date.setDate(base.getDate() - daysAgo);
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      date.setHours(10, inserted % 4, 0, 0);
      insertUserExecution(db, createRes.body.id, date.toISOString());
      inserted++;
    }

    const scanRes = await request(app).post('/heartbeat/scan').send();
    expect(scanRes.status).toBe(200);
    expect(scanRes.body.suggestions_created).toHaveLength(1);

    const suggestionsRes = await request(app).get('/suggestions');
    expect(suggestionsRes.status).toBe(200);
    expect(suggestionsRes.body[0].confidence_score).toBeGreaterThanOrEqual(0.7);
    expect(suggestionsRes.body[0].suggested_skill.trigger_type).toBe('time');

    const acceptRes = await request(app).post(`/suggestions/${suggestionsRes.body[0].id}/accept`).send();
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.skill_id).toBeDefined();

    const skillRes = await request(app).get(`/skills/${acceptRes.body.skill_id}`);
    expect(skillRes.status).toBe(200);
    expect(skillRes.body.trigger_type).toBe('time');
    expect(Array.isArray(skillRes.body.actions)).toBe(true);
  });
});
