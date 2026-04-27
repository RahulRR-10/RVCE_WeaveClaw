const request = require('supertest');

process.env.DB_PATH = ':memory:';

const app = require('../src/index');

async function createSkill(data) {
  return request(app).post('/skills').send(data);
}

describe('Conflict detection and semantic validation', () => {
  test('conflict_detected response has structured resolution options', async () => {
    await createSkill({
      name: 'AC Cold',
      trigger: { type: 'time', value: '23:00', source: 'schedule' },
      actions: [{ service: 'simulation', device_id: 'bedroom-ac', command: 'set_temperature', params: { value: 18, unit: 'celsius' } }],
    });

    const conflictRes = await createSkill({
      name: 'AC Warm',
      trigger: { type: 'time', value: '23:15', source: 'schedule' },
      actions: [{ service: 'simulation', device_id: 'bedroom-ac', command: 'set_temperature', params: { value: 28, unit: 'celsius' } }],
    });

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.type).toBe('conflict_detected');

    const conflict = conflictRes.body.conflict;
    expect(conflict.recommended_resolution).toBe('prioritise_new');
    expect(Array.isArray(conflict.resolution_options)).toBe(true);
    const option = conflict.resolution_options[0];
    expect(option).toHaveProperty('id');
    expect(option).toHaveProperty('label');
    expect(option).toHaveProperty('consequence');
    expect(option).toHaveProperty('recommended');
    expect(conflict.resolution_options.some((item) => item.id === 'merge_into_one')).toBe(false);
  });

  test('POST /conflicts/resolve with prioritise_new deactivates existing', async () => {
    const existing = await createSkill({
      name: 'Old Skill',
      trigger: { type: 'natural_language', value: 'conflict test trigger', source: 'user_input' },
      actions: [{ service: 'simulation', command: 'turn_on', params: {} }],
    });

    const res = await request(app).post('/conflicts/resolve').send({
      conflicting_skill_id: existing.body.id,
      resolution: 'prioritise_new',
      new_skill: {},
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('existing_deactivated');
  });

  test('POST /conflicts/resolve rejects merge_into_one for contradictory_device_command', async () => {
    const existing = await createSkill({
      name: 'Lights On',
      trigger: { type: 'natural_language', value: 'lights conflict test', source: 'user_input' },
      actions: [{ service: 'simulation', device_id: 'living-room-lights', command: 'turn_on', params: {} }],
    });

    const res = await request(app).post('/conflicts/resolve').send({
      conflicting_skill_id: existing.body.id,
      resolution: 'merge_into_one',
      conflict_type: 'contradictory_device_command',
      new_skill: {
        actions: [{ service: 'simulation', device_id: 'living-room-lights', command: 'turn_off', params: {} }],
      },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/merge_into_one is not valid/);
  });

  test('community imports with unregistered devices require warning acknowledgement', async () => {
    const res = await createSkill({
      name: 'Imported Skill',
      source: 'community_imported',
      trigger: { type: 'natural_language', value: 'imported skill trigger', source: 'user_input' },
      actions: [{ service: 'simulation', device_id: 'missing-device', command: 'turn_on', params: {} }],
    });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('device_mismatch');
    expect(res.body.warnings[0]).toMatch(/missing-device/);
  });
});
