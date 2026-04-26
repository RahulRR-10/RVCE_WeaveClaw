function parseGithubWebhook(payload = {}) {
  return {
    event: 'push',
    pusher: payload.pusher?.name || payload.sender?.login || null,
    repo: payload.repository?.full_name || null,
    commit_count: Array.isArray(payload.commits) ? payload.commits.length : 0,
    ref: payload.ref || null,
  };
}

module.exports = { parseGithubWebhook };
