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
    name: 'Webhook Test',
    trigger: { type: 'webhook', source: 'github', event: 'push' },
    actions: [{ service: 'simulation', command: 'turn_on', params: {} }]
  });
  const wId = skillRes.body.id;
  const res = await request(app).post(`/webhooks/${wId}`).send({ pusher: { name: 'test' } });
  expect(res.status).toBe(200);
  expect(res.body.received).toBe(true);
});
