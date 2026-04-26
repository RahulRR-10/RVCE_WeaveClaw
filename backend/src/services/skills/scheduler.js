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
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    for (const skill of scheduledSkills) {
      if (skill.trigger_value !== hhmm) continue;

      const extra = skill.trigger_extra ? JSON.parse(skill.trigger_extra) : {};
      if (!checkDayOfWeek(extra.recurrence)) continue;

      console.log(`[SCHEDULER] Firing skill: ${skill.name}`);
      try {
        await executeSkill(skill.id, 'schedule');
      } catch (err) {
        console.error(`[SCHEDULER] Error executing ${skill.id}:`, err.message);
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

  const allowedDays = match[1].split(',').map(day => days[day]).filter(day => day !== undefined);
  return allowedDays.includes(new Date().getDay());
}

module.exports = { startScheduler, checkDayOfWeek };
