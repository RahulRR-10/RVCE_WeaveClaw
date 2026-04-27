require('dotenv').config();
const crypto = require('crypto');
const { getDb } = require('../src/db/db');

const db = getDb();

const devices = [
	{
		id: 'living-room-lights',
		name: 'Living Room Lights',
		type: 'light',
		capabilities: JSON.stringify(['turn_on', 'turn_off', 'set_color']),
		service: 'openclaw',
	},
	{
		id: 'bedroom-ac',
		name: 'Bedroom AC',
		type: 'ac',
		capabilities: JSON.stringify(['turn_on', 'turn_off', 'set_temperature']),
		service: 'openclaw',
	},
	{
		id: 'kitchen-lights',
		name: 'Kitchen Lights',
		type: 'light',
		capabilities: JSON.stringify(['turn_on', 'turn_off']),
		service: 'openclaw',
	},
	{
		id: 'office-lights',
		name: 'Office Lights',
		type: 'light',
		capabilities: JSON.stringify(['turn_on', 'turn_off', 'set_color']),
		service: 'openclaw',
	},
];

for (const device of devices) {
	db.prepare(
		'INSERT OR REPLACE INTO devices (id, name, type, capabilities, service) VALUES (?, ?, ?, ?, ?)'
	).run(device.id, device.name, device.type, device.capabilities, device.service);
}

const focusSkillId = ensureFocusSkill();
seedFocusExecutions(focusSkillId);

console.log('Demo data seeded. Now run: curl -X POST http://localhost:3000/heartbeat/scan');

function ensureFocusSkill() {
	const existing = db.prepare("SELECT id FROM skills WHERE name = 'Focus Mode' LIMIT 1").get();
	if (existing?.id) return existing.id;

	const focusId = crypto.randomUUID();
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
		INSERT INTO skills (
			id, name, description, trigger_type, trigger_value, trigger_source,
			trigger_extra, conditions, actions, metadata, is_active
		)
		VALUES (?, 'Focus Mode', 'Start deep work session', 'natural_language', 'start focus mode',
			'user_input', '{}', '[]',
			'[{"service":"openclaw","device_id":"office-lights","command":"set_color","params":{"hex":"#FFD700"}}]',
			?, 1)
	`).run(focusId, focusMetadata);

	return focusId;
}

function seedFocusExecutions(focusSkillId) {
	const now = new Date();
	let inserted = 0;
	let daysAgo = 1;

	while (inserted < 10) {
		const date = new Date(now);
		date.setDate(date.getDate() - daysAgo);
		daysAgo += 1;

		if (date.getDay() === 0 || date.getDay() === 6) {
			continue;
		}

		date.setHours(10, Math.floor(Math.random() * 10), 0, 0);

		db.prepare(`
			INSERT INTO execution_logs (id, skill_id, executed_at, triggered_by, status, actions_result)
			VALUES (?, ?, ?, 'user_input', 'simulated',
				'[{"action_index":0,"status":"simulated","response":"office-lights -> color #FFD700"}]')
		`).run(crypto.randomUUID(), focusSkillId, date.toISOString());

		inserted += 1;
	}
}
