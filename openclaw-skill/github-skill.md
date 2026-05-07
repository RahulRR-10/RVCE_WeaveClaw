---
name: github
description: "Interact with GitHub using the `gh` CLI. Use when working with GitHub issues, pull requests, workflow runs, API queries, or repository automation. Also use when you need to watch a repository's default branch for new pushes, inspect changed files, run automated local fixes, and push those fixes to a fresh branch with device light-status signaling."
---

# GitHub Skill

Use the `gh` CLI to interact with GitHub. Always specify `--repo owner/repo` when not in a git directory, or use URLs directly.

## Pull Requests

Check CI status on a PR:
```bash
gh pr checks 55 --repo owner/repo
```

List recent workflow runs:
```bash
gh run list --repo owner/repo --limit 10
```

View a run and see which steps failed:
```bash
gh run view <run-id> --repo owner/repo
```

View logs for failed steps only:
```bash
gh run view <run-id> --repo owner/repo --log-failed
```

## API for Advanced Queries

The `gh api` command is useful for accessing data not available through other subcommands.

Get PR with specific fields:
```bash
gh api repos/owner/repo/pulls/55 --jq '.title, .state, .user.login'
```

## JSON Output

Most commands support `--json` for structured output. You can use `--jq` to filter:

```bash
gh issue list --repo owner/repo --json number,title --jq '.[] | "\(.number): \(.title)"'
```

## Watch Default Branch, Fix, and Push to Fresh Branches

Use `scripts/watch-and-fix-main-pushes.sh` when you need an actual helper that:
- watches the repository default branch (or `main` fallback) for new upstream pushes/commits
- fetches and checks the latest pushed state on that branch
- turns the Wipro bulb red when a new push is detected
- turns the Wipro bulb blink while automated correction is running
- creates a fresh branch for each detected upstream change using a sensible timestamped name
- commits and pushes the corrections to that fresh branch
- turns the Wipro bulb green after a successful push

### Branch naming

The script creates a new branch every time using this pattern:

```text
auto/fix-<base-branch>-<UTC timestamp>-<shortsha>
```

Example:

```text
auto/fix-main-20260507-104233-a1b2c3d
```

### Important behavior notes

- The script watches the repository's default branch by querying GitHub. If that lookup fails, it falls back to `main`.
- On first run, it records the current upstream commit as baseline and does not retroactively create a fix branch.
- The script does not guess a fix command. You must provide one that matches the repo, such as `npm run lint -- --fix`, `cargo fmt`, `go fmt ./...`, `ruff check --fix .`, or a project-specific repair script.
- If the fix command produces no changes, the script records the commit as seen and exits without pushing a branch.
- Use a dedicated local clone as the watcher worktree.

### Typical usage

One-shot check:

```bash
bash skills/github/scripts/watch-and-fix-main-pushes.sh \
  --repo owner/repo \
  --workdir ~/src/repo \
  --once \
  --fix-command 'npm install && npm run lint -- --fix && npm test'
```

Continuous polling:

```bash
bash skills/github/scripts/watch-and-fix-main-pushes.sh \
  --repo owner/repo \
  --workdir ~/src/repo \
  --poll-seconds 60 \
  --fix-command 'npm install && npm run lint -- --fix && npm test'
```

### Inspect pushed files on the base branch

When a new push is detected and you need to review which files changed before or after fixing, compare the previous seen SHA with the new upstream SHA:

```bash
git diff --name-only <old-sha> <new-sha>
```

Or inspect the latest commit files directly:

```bash
gh api repos/owner/repo/commits/<sha> --jq '.files[].filename'
```

### Operational guidance

- Keep the fix command deterministic and safe to rerun.
- Prefer formatters, linters with autofix, syntax validation, and focused tests.
- Avoid auto-merging to the default branch from this workflow.
- Review and open a PR from the generated branch if broader changes are made.
- If the repo needs different fix strategies for different file types, wrap them in a project script and pass that script as `--fix-command`.

