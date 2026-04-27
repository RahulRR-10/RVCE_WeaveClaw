/**
 * Watcher Background Job Runner
 *
 * Polls each active watcher on its configured schedule.
 * Currently supports: github_commits
 *
 * Uses setInterval for each watcher, keyed by watcher ID.
 */

const { getDb } = require('../../db/db');
const { notify } = require('../notifications/notify');

// Active interval handles, keyed by watcher.id
const runningJobs = new Map();

/**
 * Start the watcher runner — loads all active watchers from DB and starts polling.
 */
function startWatcherRunner() {
  const db = getDb();
  const watchers = db.prepare('SELECT * FROM watchers WHERE is_active = 1').all();

  console.log(`[WATCHER] Starting runner with ${watchers.length} active watcher(s)`);

  for (const watcher of watchers) {
    scheduleWatcher(watcher);
  }
}

/**
 * Schedule polling for a single watcher.
 */
function scheduleWatcher(watcher) {
  // Don't double-schedule
  if (runningJobs.has(watcher.id)) return;

  const config = JSON.parse(watcher.config || '{}');
  const intervalMs = (config.poll_interval_seconds || 60) * 1000;

  console.log(`[WATCHER] Scheduling ${watcher.type} watcher ${watcher.id} every ${intervalMs / 1000}s`);

  // Run immediately on first schedule, then at interval
  pollWatcher(watcher.id);

  const handle = setInterval(() => pollWatcher(watcher.id), intervalMs);
  runningJobs.set(watcher.id, handle);
}

/**
 * Stop polling for a watcher.
 */
function stopWatcher(watcherId) {
  const handle = runningJobs.get(watcherId);
  if (handle) {
    clearInterval(handle);
    runningJobs.delete(watcherId);
    console.log(`[WATCHER] Stopped watcher ${watcherId}`);
  }
}

/**
 * Stop all running watchers.
 */
function stopAllWatchers() {
  for (const [id, handle] of runningJobs) {
    clearInterval(handle);
    console.log(`[WATCHER] Stopped watcher ${id}`);
  }
  runningJobs.clear();
}

/**
 * Poll a single watcher by ID — reads fresh config from DB.
 */
async function pollWatcher(watcherId) {
  const db = getDb();
  const watcher = db.prepare('SELECT * FROM watchers WHERE id = ? AND is_active = 1').get(watcherId);

  if (!watcher) {
    stopWatcher(watcherId);
    return;
  }

  try {
    switch (watcher.type) {
      case 'github_commits':
        await pollGithubCommits(watcher, db);
        break;
      default:
        console.warn(`[WATCHER] Unknown watcher type: ${watcher.type}`);
    }
  } catch (err) {
    console.error(`[WATCHER] Poll failed for ${watcherId}: ${err.message}`);

    // Surface repo_private_no_token through the notification system
    if (err.reason === 'repo_private_no_token') {
      try {
        await notify('default', {
          title: '⚠️ Watcher Error',
          body: err.message,
          metadata: { watcher_id: watcherId, reason: err.reason },
        }, watcher.notify_via);
      } catch {
        // notification delivery itself failed; already logged inside notify()
      }
    }
  }
}

/**
 * Poll GitHub for new commits on a repo/branch.
 */
async function pollGithubCommits(watcher, db) {
  const config = JSON.parse(watcher.config || '{}');
  const { repo, branch } = config;

  if (!repo) {
    console.warn(`[WATCHER] github_commits watcher ${watcher.id} has no repo configured`);
    return;
  }

  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'WeaveClaw/1.0',
  };

  // Use GITHUB_TOKEN if available
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const branchParam = branch || 'main';
  const url = `https://api.github.com/repos/${repo}/commits?sha=${branchParam}&per_page=5`;

  let response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    console.error(`[WATCHER] GitHub API request failed: ${err.message}`);
    return;
  }

  // ─── Error handling ───────────────────────────────────────────
  if (response.status === 404) {
    const err = new Error(`Repository "${repo}" not found on GitHub. Check the owner/repo format.`);
    err.reason = 'repo_not_found';
    throw err;
  }

  if ((response.status === 401 || response.status === 403) && !token) {
    const err = new Error(
      `That repo looks private. Add a GITHUB_TOKEN to your env and I'll be able to access it.`
    );
    err.reason = 'repo_private_no_token';
    throw err;
  }

  // 409 = repo exists but is empty (no commits yet). Keep watching silently.
  if (response.status === 409) {
    db.prepare('UPDATE watchers SET last_checked_at = datetime(\'now\') WHERE id = ?')
      .run(watcher.id);
    console.log(`[WATCHER] ${repo} is empty (no commits yet) — will check again next poll`);
    return;
  }

  if (!response.ok) {
    console.error(`[WATCHER] GitHub API returned ${response.status} for ${repo}`);
    return;
  }

  const commits = await response.json();
  if (!Array.isArray(commits) || commits.length === 0) return;

  const latestSha = commits[0].sha;

  // First poll — just record the SHA, don't fire notifications
  if (!watcher.last_commit_sha) {
    db.prepare('UPDATE watchers SET last_commit_sha = ?, last_checked_at = datetime(\'now\') WHERE id = ?')
      .run(latestSha, watcher.id);
    console.log(`[WATCHER] Initial commit recorded for ${repo}: ${latestSha.slice(0, 7)}`);
    return;
  }

  // No new commits since last check
  if (latestSha === watcher.last_commit_sha) {
    db.prepare('UPDATE watchers SET last_checked_at = datetime(\'now\') WHERE id = ?')
      .run(watcher.id);
    return;
  }

  // ─── New commit(s) detected ─────────────────────────────────
  // Find all new commits (those after last_commit_sha)
  const newCommits = [];
  for (const commit of commits) {
    if (commit.sha === watcher.last_commit_sha) break;
    newCommits.push(commit);
  }

  // Update last seen SHA
  db.prepare('UPDATE watchers SET last_commit_sha = ?, last_checked_at = datetime(\'now\') WHERE id = ?')
    .run(latestSha, watcher.id);

  // Notify for each new commit
  for (const commit of newCommits) {
    const author = commit.commit?.author?.name || commit.author?.login || 'unknown';
    const messagePreview = (commit.commit?.message || '').split('\n')[0].slice(0, 80);

    try {
      await notify('default', {
        title: `📦 New commit on ${repo}`,
        body: `${author}: ${messagePreview}`,
        metadata: {
          watcher_id: watcher.id,
          repo,
          branch: branchParam,
          commit_sha: commit.sha,
          commit_author: author,
          commit_message: commit.commit?.message || '',
          commit_url: commit.html_url,
        },
      }, watcher.notify_via);
    } catch (err) {
      console.error(`[WATCHER] Notification failed for commit ${commit.sha.slice(0, 7)}: ${err.message}`);
    }
  }

  console.log(`[WATCHER] ${newCommits.length} new commit(s) detected on ${repo}/${branchParam}`);
}

module.exports = {
  startWatcherRunner,
  scheduleWatcher,
  stopWatcher,
  stopAllWatchers,
  pollWatcher,
};
