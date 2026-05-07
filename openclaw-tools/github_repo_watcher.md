# GitHub Repo Watcher

First version of a background watcher for Termux/OpenClaw.

## What it does

- polls repo-specific GitHub API endpoints for commits, issues, PRs, and releases
- works with private repos when you provide a GitHub token with repo access
- tracks last seen state in a state file
- logs new matching events
- optionally calls a notify hook for each alert

Supported watch groups:
- pushes
- issues
- prs
- releases
- all

## Install in Termux

You should have these:

```bash
pkg update
pkg install curl jq git
```

Required for private repos, and recommended for better API limits:
- a GitHub personal access token with access to the repo
- classic token: `repo` scope is enough for private repo reads
- fine-grained token: give repository read access for Contents, Issues, Pull requests, and Metadata
- set it with:

```bash
export GITHUB_TOKEN=your_token_here
```

If you want it permanent:

```bash
echo 'export GITHUB_TOKEN=your_token_here' >> ~/.bashrc
source ~/.bashrc
```

## Run once

```bash
bash ~/\.openclaw/workspace/tools/github_repo_watcher.sh \
  --repo RahulRR-10/WeaveClaw \
  --watch all \
  --once
```

## Run in background

```bash
nohup bash ~/\.openclaw/workspace/tools/github_repo_watcher.sh \
  --repo RahulRR-10/WeaveClaw \
  --watch all \
  --interval 300 \
  > ~/.openclaw/state/github-watchers/RahulRR-10__WeaveClaw.runner.log 2>&1 &
```

## Files used

State/log directory:

```bash
~/.openclaw/state/github-watchers
```

Example files:
- `RahulRR-10__WeaveClaw.last_event`
- `RahulRR-10__WeaveClaw.log`
- `RahulRR-10__WeaveClaw.pid`
- `RahulRR-10__WeaveClaw.runner.log`

## Telegram notifications

This watcher can now send Telegram messages through a notify hook.
A helper script is available at:

```bash
~/.openclaw/workspace/tools/github_repo_notify_telegram.sh
```

Example:

```bash
nohup bash ~/.openclaw/workspace/tools/github_repo_watcher.sh \
  --repo RahulRR-10/WeaveClaw \
  --watch all \
  --interval 300 \
  --notify-cmd '~/.openclaw/workspace/tools/github_repo_notify_telegram.sh' \
  > ~/.openclaw/state/github-watchers/RahulRR-10__WeaveClaw.runner.log 2>&1 &
```

Notes:
- the helper uses the Telegram bot token from `~/.openclaw/openclaw.json`
- it currently defaults to your direct Telegram chat id unless `OPENCLAW_TELEGRAM_CHAT_ID` is set
- private repos still require a GitHub token with repo access

## Next upgrade ideas

- add Telegram/OpenClaw notify delivery
- add repo config file for multiple watchers
- add start/stop/status helper commands
- run under Termux:Boot if you want it after reboot
