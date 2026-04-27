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
        message: 'Existing skill deactivated. POST to /skills to save your new skill; conflict is resolved.',
      });

    case 'prioritise_existing':
      return res.json({
        action: 'new_discarded',
        message: 'Keeping existing skill. The new skill was not saved.',
      });

    case 'merge_into_one': {
      if (conflict_type === 'contradictory_device_command') {
        return res.status(400).json({
          error: 'merge_into_one is not valid for contradictory_device_command conflicts.',
          reason: 'Merging contradictory actions would fire both simultaneously. Choose prioritise_new, prioritise_existing, or edit_new_before_saving.',
        });
      }

      const existing = db.prepare('SELECT * FROM skills WHERE id = ?').get(conflicting_skill_id);
      if (!existing) return res.status(404).json({ error: 'Conflicting skill not found' });

      const mergedActions = [
        ...JSON.parse(existing.actions || '[]'),
        ...((new_skill && new_skill.actions) || []),
      ];

      return res.json({
        action: 'merge_preview',
        merged_skill: { ...(new_skill || {}), actions: mergedActions },
        message: 'Review the merged skill and POST to /skills to save it.',
      });
    }

    case 'edit_new_before_saving':
      return res.json({
        action: 'edit_requested',
        skill: new_skill,
        message: 'Edit the skill and resubmit to POST /skills.',
      });

    default:
      return res.status(400).json({
        error: `Unknown resolution "${resolution}". Valid: prioritise_new, prioritise_existing, merge_into_one, edit_new_before_saving`,
      });
  }
});

module.exports = router;
