#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

# Simple GitHub repo watcher for Termux/OpenClaw setups.
# Watches commits/pushes (via branch head), issues, pull requests, and releases.
# Works for private repos when a GitHub token with repo access is provided.
# Persists last-seen state and appends human-readable alerts to a log.
# Optional notify hook can be wired later for Telegram/OpenClaw delivery.

usage() {
  cat <<'EOF'
Usage:
  github_repo_watcher.sh --repo owner/repo [options]

Required:
  --repo owner/repo           Repository to watch

Options:
  --watch pushes,issues,prs,releases,all
                              Event groups to notify on (default: all)
  --interval 300              Poll interval in seconds (default: 300)
  --state-dir DIR             Directory for state/log files
                              (default: ~/.openclaw/state/github-watchers)
  --notify-cmd CMD            Command to run on each new alert.
                              The alert text is passed as the first argument.
  --once                      Run one check and exit
  --token TOKEN               GitHub token; else uses GITHUB_TOKEN env if set
  --help                      Show this help

Examples:
  github_repo_watcher.sh --repo RahulRR-10/WeaveClaw --watch all
  github_repo_watcher.sh --repo openclaw/openclaw --watch pushes,releases --interval 600 --once
EOF
}

REPO=""
WATCH="all"
INTERVAL=300
STATE_DIR="$HOME/.openclaw/state/github-watchers"
NOTIFY_CMD=""
RUN_ONCE=0
TOKEN="${GITHUB_TOKEN:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --watch) WATCH="$2"; shift 2 ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    --state-dir) STATE_DIR="$2"; shift 2 ;;
    --notify-cmd) NOTIFY_CMD="$2"; shift 2 ;;
    --once) RUN_ONCE=1; shift ;;
    --token) TOKEN="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$REPO" ]]; then
  echo "--repo is required" >&2
  usage
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

slug="${REPO//\//__}"
mkdir -p "$STATE_DIR"
STATE_FILE="$STATE_DIR/${slug}.state.json"
LOG_FILE="$STATE_DIR/${slug}.log"
PID_FILE="$STATE_DIR/${slug}.pid"

normalize_watch() {
  local raw="$1"
  if [[ "$raw" == "all" ]]; then
    echo "all"
    return
  fi
  echo "$raw" | tr '[:upper:]' '[:lower:]' | tr -d ' '
}

WATCH="$(normalize_watch "$WATCH")"

matches_watch() {
  local group="$1"
  [[ "$WATCH" == "all" ]] && return 0

  IFS=',' read -r -a wanted <<< "$WATCH"
  for w in "${wanted[@]}"; do
    case "$w" in
      pushes|push|commits)
        [[ "$group" == "pushes" ]] && return 0
        ;;
      issues|issue)
        [[ "$group" == "issues" ]] && return 0
        ;;
      prs|pr|pulls|pull_requests)
        [[ "$group" == "prs" ]] && return 0
        ;;
      releases|release)
        [[ "$group" == "releases" ]] && return 0
        ;;
      all)
        return 0
        ;;
    esac
  done
  return 1
}

gh_api() {
  local url="$1"
  if [[ -n "$TOKEN" ]]; then
    curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer $TOKEN" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "$url"
  else
    curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "$url"
  fi
}

send_notification() {
  local text="$1"
  if [[ -n "$NOTIFY_CMD" ]]; then
    "$NOTIFY_CMD" "$text"
  fi
}

load_state() {
  if [[ -f "$STATE_FILE" ]]; then
    cat "$STATE_FILE"
  else
    echo '{}'
  fi
}

save_state() {
  local state_json="$1"
  printf '%s\n' "$state_json" > "$STATE_FILE"
}

check_pushes() {
  matches_watch "pushes" || return 0

  local branch_data branch sha msg url state old_sha initialized=0 alert
  branch_data="$(gh_api "https://api.github.com/repos/$REPO")"
  branch="$(jq -r '.default_branch // "main"' <<< "$branch_data")"
  state="$(load_state)"
  old_sha="$(jq -r '.pushes.sha // empty' <<< "$state")"

  branch_data="$(gh_api "https://api.github.com/repos/$REPO/commits/$branch")"
  sha="$(jq -r '.sha // empty' <<< "$branch_data")"
  msg="$(jq -r '.commit.message // "(no commit message)"' <<< "$branch_data" | head -n1)"
  url="$(jq -r '.html_url // empty' <<< "$branch_data")"

  [[ -z "$sha" ]] && return 0
  [[ -z "$old_sha" ]] && initialized=1

  if [[ "$initialized" -eq 0 && "$sha" != "$old_sha" ]]; then
    alert="[$(date -Is)] $REPO: new commit on $branch — $msg${url:+ ($url)}"
    echo "$alert" >> "$LOG_FILE"
    send_notification "$alert" || true
  fi

  state="$(jq --arg sha "$sha" '.pushes.sha = $sha' <<< "$state")"
  save_state "$state"

  if [[ "$initialized" -eq 1 ]]; then
    echo "[$(date -Is)] Initialized push watcher for $REPO at $sha" >> "$LOG_FILE"
  fi
}

check_issues() {
  matches_watch "issues" || return 0

  local data id title url state old_id initialized=0 alert
  data="$(gh_api "https://api.github.com/repos/$REPO/issues?state=all&sort=updated&direction=desc&per_page=1")"
  id="$(jq -r 'map(select(has("pull_request") | not)) | .[0].id // empty' <<< "$data")"
  title="$(jq -r 'map(select(has("pull_request") | not)) | .[0].title // "(no title)"' <<< "$data")"
  url="$(jq -r 'map(select(has("pull_request") | not)) | .[0].html_url // empty' <<< "$data")"
  [[ -z "$id" ]] && return 0

  state="$(load_state)"
  old_id="$(jq -r '.issues.id // empty' <<< "$state")"
  [[ -z "$old_id" ]] && initialized=1

  if [[ "$initialized" -eq 0 && "$id" != "$old_id" ]]; then
    alert="[$(date -Is)] $REPO: issue activity — $title${url:+ ($url)}"
    echo "$alert" >> "$LOG_FILE"
    send_notification "$alert" || true
  fi

  state="$(jq --arg id "$id" '.issues.id = $id' <<< "$state")"
  save_state "$state"

  if [[ "$initialized" -eq 1 ]]; then
    echo "[$(date -Is)] Initialized issue watcher for $REPO at $id" >> "$LOG_FILE"
  fi
}

check_prs() {
  matches_watch "prs" || return 0

  local data id title url state old_id initialized=0 alert
  data="$(gh_api "https://api.github.com/repos/$REPO/pulls?state=all&sort=updated&direction=desc&per_page=1")"
  id="$(jq -r '.[0].id // empty' <<< "$data")"
  title="$(jq -r '.[0].title // "(no title)"' <<< "$data")"
  url="$(jq -r '.[0].html_url // empty' <<< "$data")"
  [[ -z "$id" ]] && return 0

  state="$(load_state)"
  old_id="$(jq -r '.prs.id // empty' <<< "$state")"
  [[ -z "$old_id" ]] && initialized=1

  if [[ "$initialized" -eq 0 && "$id" != "$old_id" ]]; then
    alert="[$(date -Is)] $REPO: PR activity — $title${url:+ ($url)}"
    echo "$alert" >> "$LOG_FILE"
    send_notification "$alert" || true
  fi

  state="$(jq --arg id "$id" '.prs.id = $id' <<< "$state")"
  save_state "$state"

  if [[ "$initialized" -eq 1 ]]; then
    echo "[$(date -Is)] Initialized PR watcher for $REPO at $id" >> "$LOG_FILE"
  fi
}

check_releases() {
  matches_watch "releases" || return 0

  local data id tag url state old_id initialized=0 alert
  data="$(gh_api "https://api.github.com/repos/$REPO/releases?per_page=1")"
  id="$(jq -r '.[0].id // empty' <<< "$data")"
  tag="$(jq -r '.[0].tag_name // .[0].name // "(unnamed release)"' <<< "$data")"
  url="$(jq -r '.[0].html_url // empty' <<< "$data")"
  [[ -z "$id" ]] && return 0

  state="$(load_state)"
  old_id="$(jq -r '.releases.id // empty' <<< "$state")"
  [[ -z "$old_id" ]] && initialized=1

  if [[ "$initialized" -eq 0 && "$id" != "$old_id" ]]; then
    alert="[$(date -Is)] $REPO: new release — $tag${url:+ ($url)}"
    echo "$alert" >> "$LOG_FILE"
    send_notification "$alert" || true
  fi

  state="$(jq --arg id "$id" '.releases.id = $id' <<< "$state")"
  save_state "$state"

  if [[ "$initialized" -eq 1 ]]; then
    echo "[$(date -Is)] Initialized release watcher for $REPO at $id" >> "$LOG_FILE"
  fi
}

check_once() {
  check_pushes
  check_issues
  check_prs
  check_releases
}

echo $$ > "$PID_FILE"
trap 'rm -f "$PID_FILE"' EXIT

if [[ "$RUN_ONCE" -eq 1 ]]; then
  check_once
  exit 0
fi

while true; do
  check_once || echo "[$(date -Is)] Check failed for $REPO" >> "$LOG_FILE"
  sleep "$INTERVAL"
done
