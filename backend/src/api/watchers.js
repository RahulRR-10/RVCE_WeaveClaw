/**
 * Watcher API Endpoints
 *
 * POST   /watchers          — register a new watcher
 * GET    /watchers          — list active watchers
 * DELETE /watchers/:id      — cancel a watcher
 * GET    /notifications     — list recent notifications
 * PATCH  /notifications/:id/read — mark notification as read
 */

const crypto = require('crypto');
const express = require('express');
const { getDb } = require('../db/db');
const { scheduleWatcher, stopWatcher } = require('../services/watchers/watcher_runner');

const router = express.Router();

// ─── POST /watchers ─────────────────────────────────────────────
router.post('/', (req, res) => {
  const { type, config, notify_via } = req.body || {};

  // ─── Validation ─────────────────────────────────────────────
  if (!type || !['github_commits', 'file_change'].includes(type)) {
    return res.status(400).json({
      type: 'error',
      reason: 'invalid_watcher_config',
      message: 'Watcher type must be "github_commits" or "file_change".',
    });
  }

  if (!config || typeof config !== 'object') {
    return res.status(400).json({
      type: 'error',
      reason: 'invalid_watcher_config',
      message: 'Watcher config is required.',
    });
  }

  if (type === 'github_commits') {
    if (!config.repo || typeof config.repo !== 'string') {
      return res.status(400).json({
        type: 'error',
        reason: 'invalid_watcher_config',
        message: 'config.repo is required for github_commits watchers. Use owner/repo format.',
      });
    }
    if (!config.repo.includes('/')) {
      return res.status(400).json({
        type: 'error',
        reason: 'invalid_watcher_config',
        message: 'config.repo must be in owner/repo format, e.g. rahul/my-project.',
      });
    }
  }

  const channel = notify_via || 'in_app';
  if (!['push', 'in_app'].includes(channel)) {
    return res.status(400).json({
      type: 'error',
      reason: 'invalid_watcher_config',
      message: 'notify_via must be "push" or "in_app".',
    });
  }

  // Defaults
  const watcherConfig = {
    repo: config.repo || null,
    branch: config.branch || 'main',
    poll_interval_seconds: config.poll_interval_seconds || 60,
  };

  const db = getDb();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO watchers (id, type, config, notify_via)
    VALUES (?, ?, ?, ?)
  `).run(id, type, JSON.stringify(watcherConfig), channel);

  const watcher = db.prepare('SELECT * FROM watchers WHERE id = ?').get(id);

  // Start polling immediately
  scheduleWatcher({
    ...watcher,
    config: JSON.stringify(watcherConfig),
  });

  console.log(`[WATCHER] Registered ${type} watcher ${id} for ${watcherConfig.repo || 'N/A'}`);

  res.status(201).json({
    type: 'watcher_created',
    watcher: {
      ...watcher,
      config: watcherConfig,
    },
  });
});

// ─── GET /watchers ──────────────────────────────────────────────
router.get('/', (req, res) => {
  const db = getDb();
  const watchers = db.prepare('SELECT * FROM watchers ORDER BY created_at DESC').all();

  res.json(watchers.map(w => ({
    ...w,
    config: JSON.parse(w.config || '{}'),
    is_active: Boolean(w.is_active),
  })));
});

// ─── DELETE /watchers/:id ───────────────────────────────────────
router.delete('/:id', (req, res) => {
  const db = getDb();
  const watcher = db.prepare('SELECT * FROM watchers WHERE id = ?').get(req.params.id);

  if (!watcher) {
    return res.status(404).json({
      type: 'error',
      reason: 'invalid_watcher_config',
      message: 'Watcher not found.',
    });
  }

  // Stop the background job
  stopWatcher(req.params.id);

  // Remove from DB
  db.prepare('DELETE FROM watchers WHERE id = ?').run(req.params.id);

  console.log(`[WATCHER] Cancelled watcher ${req.params.id}`);
  res.json({ message: 'Watcher cancelled', id: req.params.id });
});

// ─── GET /notifications ─────────────────────────────────────────
router.get('/notifications', (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const notifications = db.prepare(`
    SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?
  `).all(limit);

  res.json(notifications.map(n => ({
    ...n,
    metadata: JSON.parse(n.metadata || '{}'),
    is_read: Boolean(n.is_read),
  })));
});

// ─── PATCH /notifications/:id/read ──────────────────────────────
router.patch('/notifications/:id/read', (req, res) => {
  const db = getDb();
  const result = db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  res.json({ message: 'Notification marked as read' });
});

module.exports = router;
