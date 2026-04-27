CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN (
    'natural_language','time','webhook','api_event','device_event','health_event'
  )),
  trigger_value TEXT,
  trigger_source TEXT,
  trigger_extra TEXT,          -- JSON blob for extras (recurrence, repo, event)
  conditions TEXT DEFAULT '[]',-- JSON array
  actions TEXT NOT NULL,       -- JSON array
  metadata TEXT NOT NULL,      -- JSON object
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS execution_logs (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  executed_at TEXT DEFAULT (datetime('now')),
  triggered_by TEXT NOT NULL CHECK(triggered_by IN (
    'user_input','heartbeat','schedule','webhook','manual'
  )),
  status TEXT NOT NULL CHECK(status IN ('success','partial','failed','simulated')),
  actions_result TEXT,         -- JSON array
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  skill_id TEXT REFERENCES skills(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('automate_pattern','refine_schedule')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence_score REAL NOT NULL,
  evidence_summary TEXT,       -- JSON: {execution_count, days_observed, avg_time, std_dev}
  suggested_skill TEXT,        -- JSON: the suggested skill object to create if accepted
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','dismissed')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,          -- 'light','ac','switch','speaker','phone','coffee_machine'
  capabilities TEXT NOT NULL,  -- JSON array: ['turn_on','turn_off','set_temperature','set_color']
  service TEXT NOT NULL CHECK(service IN ('smartthings','simulation','openclaw','samsung_health')),
  external_id TEXT,            -- SmartThings device ID
  is_online INTEGER DEFAULT 1,
  registered_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS watchers (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('github_commits', 'file_change')),
  config TEXT NOT NULL,            -- JSON: { repo, branch, poll_interval_seconds }
  notify_via TEXT NOT NULL CHECK(notify_via IN ('push', 'in_app')),
  is_active INTEGER DEFAULT 1,
  last_checked_at TEXT,
  last_commit_sha TEXT,            -- for github_commits: SHA of last seen commit
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata TEXT,                   -- JSON: extra payload (repo, branch, author, etc.)
  channel TEXT NOT NULL CHECK(channel IN ('push', 'in_app')),
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_execution_logs_skill_id ON execution_logs(skill_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_executed_at ON execution_logs(executed_at);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
CREATE INDEX IF NOT EXISTS idx_watchers_is_active ON watchers(is_active);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
