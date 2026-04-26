const request = require('supertest');

process.env.DB_PATH = ':memory:';
process.env.SIMULATION_MODE = 'true';
process.env.NLP_FORCE_RULES = 'true';
process.env.GEMINI_MODEL = 'gemini-3.1-pro-preview';

const app = require('../src/index');

test('POST /chat creates a skill from natural language', async () => {
  const res = await request(app).post('/chat').send({
    message: 'Every weekday at 7am turn on the kitchen lights',
    session_id: 'test-session-1',
  });

  expect(res.status).toBe(200);
  expect(['skill_created', 'clarification_needed']).toContain(res.body.type);
}, 20000);

test('POST /chat executes existing skill on second call', async () => {
  await request(app).post('/skills').send({
    name: 'Sleep',
    trigger: { type: 'natural_language', value: 'going to sleep now', source: 'user_input' },
    actions: [{ service: 'simulation', command: 'turn_off', params: {} }],
  });

  const res = await request(app).post('/chat').send({
    message: 'going to sleep now',
    session_id: 'test-session-2',
  });

  expect(res.status).toBe(200);
  expect(['skill_executed', 'skill_created']).toContain(res.body.type);
}, 20000);

test('POST /chat handles clarification loop', async () => {
  const res1 = await request(app).post('/chat').send({
    message: 'Watch my GitHub repo and turn lights red on every push',
    session_id: 'test-session-3',
  });

  expect(res1.status).toBe(200);

  if (res1.body.type === 'clarification_needed') {
    const res2 = await request(app).post('/chat').send({
      message: 'myuser/myrepo',
      session_id: 'test-session-3',
    });

    expect(res2.status).toBe(200);
    expect(['skill_created', 'clarification_needed']).toContain(res2.body.type);
  }
}, 30000);
