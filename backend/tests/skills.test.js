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
