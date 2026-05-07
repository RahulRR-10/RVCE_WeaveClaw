#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: github_repo_notify_telegram.sh <message>" >&2
  exit 1
fi

if [[ "$1" == "--" ]]; then
  shift
fi

if [[ $# -lt 1 ]]; then
  echo "usage: github_repo_notify_telegram.sh <message>" >&2
  exit 1
fi

MESSAGE="$1"
BOT_TOKEN="${OPENCLAW_TELEGRAM_BOT_TOKEN:-}"
CHAT_ID="${OPENCLAW_TELEGRAM_CHAT_ID:-}"

if [[ -z "$BOT_TOKEN" ]]; then
  BOT_TOKEN="$(jq -r '.channels.telegram.botToken // empty' "$HOME/.openclaw/openclaw.json" 2>/dev/null || true)"
fi

if [[ -z "$CHAT_ID" ]]; then
  CHAT_ID="telegram:8097884037"
fi
CHAT_ID="${CHAT_ID#telegram:}"

if [[ -z "$BOT_TOKEN" || -z "$CHAT_ID" ]]; then
  echo "missing bot token or chat id" >&2
  exit 1
fi

curl -fsSL -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -d "chat_id=${CHAT_ID}" \
  --data-urlencode "text=${MESSAGE}" \
  -d "disable_web_page_preview=true" \
  >/dev/null
