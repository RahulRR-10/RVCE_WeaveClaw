/**
 * Notification Delivery Service
 *
 * Default channel: WebSocket push to connected clients.
 * Optional channel: FCM if FCM_SERVER_KEY exists in env.
 * All notifications are persisted to the notifications table.
 */

const crypto = require('crypto');
const { getDb } = require('../../db/db');

// ─── WebSocket client registry ──────────────────────────────────
// Maps userId → Set<ws>
const wsClients = new Map();

function registerWsClient(userId, ws) {
  if (!wsClients.has(userId)) {
    wsClients.set(userId, new Set());
  }
  wsClients.get(userId).add(ws);

  ws.on('close', () => {
    const clients = wsClients.get(userId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) wsClients.delete(userId);
    }
  });
}

/**
 * Send a notification to a user.
 *
 * @param {string} userId  - user to notify (defaults to 'default')
 * @param {object} payload - { title, body, metadata }
 * @param {string} channel - 'push' | 'in_app'
 * @returns {{ delivered: boolean, notification_id: string, channels: string[] }}
 */
async function notify(userId = 'default', { title, body, metadata } = {}, channel = 'in_app') {
  if (!title || !body) {
    const err = new Error('Notification requires title and body');
    err.reason = 'notification_failed';
    throw err;
  }

  const db = getDb();
  const id = crypto.randomUUID();
  const deliveredVia = [];

  // Persist to DB
  db.prepare(`
    INSERT INTO notifications (id, user_id, title, body, metadata, channel)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, title, body, JSON.stringify(metadata || {}), channel);

  // ─── WebSocket push ─────────────────────────────────────────
  const clients = wsClients.get(userId);
  if (clients && clients.size > 0) {
    const payload = JSON.stringify({
      type: 'notification',
      id,
      title,
      body,
      metadata,
      created_at: new Date().toISOString(),
    });

    for (const ws of clients) {
      try {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(payload);
          deliveredVia.push('websocket');
        }
      } catch {
        // client disconnected mid-send; ignore
      }
    }
  }

  // ─── FCM (optional) ────────────────────────────────────────
  const fcmKey = process.env.FCM_SERVER_KEY;
  if (channel === 'push' && fcmKey) {
    try {
      await sendFcm(fcmKey, { title, body, metadata });
      deliveredVia.push('fcm');
    } catch (err) {
      console.error('[NOTIFY] FCM delivery failed:', err.message);
    }
  }

  // In-app is always considered delivered (it's persisted in the DB)
  if (!deliveredVia.includes('websocket')) {
    deliveredVia.push('in_app_stored');
  }

  if (deliveredVia.length === 0) {
    const err = new Error('Could not deliver notification via any channel');
    err.reason = 'notification_failed';
    throw err;
  }

  console.log(`[NOTIFY] ${title} → ${userId} via [${deliveredVia.join(', ')}]`);
  return { delivered: true, notification_id: id, channels: deliveredVia };
}

/**
 * Send a push notification via Firebase Cloud Messaging (legacy HTTP API).
 */
async function sendFcm(serverKey, { title, body, metadata }) {
  const response = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `key=${serverKey}`,
    },
    body: JSON.stringify({
      to: '/topics/weaveclaw',
      notification: { title, body },
      data: metadata || {},
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`FCM HTTP ${response.status}`);
  }

  return response.json();
}

module.exports = { notify, registerWsClient, wsClients };
