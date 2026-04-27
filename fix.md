You are working on WeaveClaw, a local automation engine. The architecture is already
partially built. We are implementing and testing in two phases. Do NOT implement
Phase 2 until Phase 1 is fully working and confirmed.

## ACTUAL ARCHITECTURE (do not deviate from this)

User message
  → POST /chat  (chat.js:16)
  → rule_classifier.js  — classifies intent
  → skill_builder.js    — turns intent into a skill action plan
  → skill is saved to DB, response: { type: "skill_created" }

Execution is separate:
  → POST /skills/:id/execute  (skills.js:88)
  → skill_executor.js         — runs the skill actions
  → openclaw.js               — routes OpenClaw actions to the emulator
  → adb.js                    — shells out to the Android SDK adb binary
                                 against the target emulator id

Device-state actions (turn_on, set_temperature, etc.) are handled in openclaw.js
by updating the database — they do NOT go through adb.js.

ADB actions available: open_app, open_url, search, tap, home, back, screenshot.

DO NOT create a new emulator adapter. openclaw.js and adb.js are the real interface.

---

## CONVERSATIONAL CLARIFICATION (applies to both phases)

WeaveClaw chat must never silently fail or return a raw error to the user.
Instead it must behave like a conversational assistant — asking follow-up questions
when it needs more information, and confirming before acting when something is ambiguous.

This must be implemented as a multi-turn loop inside POST /chat using session_id
to carry context between messages.

---

### WHEN TO ASK A QUESTION INSTEAD OF ACTING

Implement clarification triggers for these cases:

**App control:**
- App name is ambiguous or unknown →
  "I couldn't find an app called '{name}' on the emulator. Did you mean one of these?
   [list installed packages] or type the exact app name."
- Multiple matches found →
  "I found a few apps matching '{name}': [list]. Which one did you want?"
- Emulator is offline →
  "I can't reach the emulator right now. Is it running?"

**Watcher / background jobs:**
- Repo not specified →
  "Which repo should I watch? Give me the owner/repo format, e.g. rahul/my-project."
- Repo is private and no token is configured →
  "That repo looks private. Add a GITHUB_TOKEN to your env and I'll be able to access it."
- Branch not specified when intent implies a specific branch →
  "Which branch should I watch on {repo}? I'll default to main unless you specify."
- Poll frequency not specified for a watcher →
  "How often should I check? Every minute, every 5 minutes, or something else?"
- Notification channel not specified →
  "How should I notify you when something happens? In-app or push notification?"

**General:**
- Intent is too vague to act on →
  "I'm not sure what you want me to do. Can you give me a bit more detail?"
- A required parameter is missing from any action →
  Ask specifically for that parameter. Do not guess.

---

### HOW THE CLARIFICATION LOOP WORKS

1. When a clarification is needed, chat.js returns:
   {
     "type": "clarification_needed",
     "question": "<question to show the user>",
     "context": { ...partial intent and extracted params so far... }
   }

2. The partial intent and all extracted parameters must be saved to session storage
   keyed by session_id. Do not re-parse from scratch on the next message.

3. When the user replies, chat.js loads the session context, merges the new answer
   into the existing partial intent, and re-evaluates. If all parameters are now
   resolved, proceed to execution. If not, ask the next question.

4. At no point should the user have to repeat information they already gave.
   Each reply should only fill in what was missing.

---

### CONFIRMATION BEFORE ACTING (for destructive or ambiguous actions)

Before executing any action that is hard to undo or could affect multiple things,
ask for confirmation:
- "Just to confirm — you want me to open {app} on the emulator. Go ahead?"
- "I'll start watching {repo} on {branch} and notify you in-app every {interval}.
   Does that sound right?"

Only proceed after the user confirms. If they say no or correct something,
update the context and re-confirm.

---

### TONE

Keep questions short and direct. One question at a time — do not ask multiple
things in a single message. If there are multiple unknowns, ask for the most
important one first and chain the rest after the user replies.

---

# PHASE 1 — APP & DEVICE CONTROL (implement and verify this first)

The goal of Phase 1 is: user types "open YouTube" or "open the camera app" in chat,
and the emulator actually opens that app. End to end. Nothing simulated.

---

### 1. AUTO-EXECUTE DEVICE COMMANDS FROM CHAT
This is the most critical missing piece.

Currently chat.js always returns skill_created and never triggers execution.
"Open YouTube" saves a skill but the emulator never moves.

Fix chat.js so that when the classified intent is device_command:
- Build the skill via skill_builder.js as normal
- Immediately call executeSkill (same path as POST /skills/:id/execute)
- Return { type: "skill_executed", result: ... } instead of skill_created

For all other intent types, keep the existing behavior (save and return skill_created).

Do not duplicate executor logic — reuse the exact same executeSkill function
that skills.js:88 already calls.

---

### 2. INTENT CLASSIFICATION FOR APP CONTROL
Audit rule_classifier.js to ensure these phrases correctly classify as device_command:
- "open [app name]"
- "launch [app name]"
- "open the [app name] app"
- "start [app name]"
- "go to [app name]"

The classified action must map to the open_app ADB action with the app name
extracted as a parameter.

If classification is missing or the parameter extraction is wrong, fix it.
Add at least five test cases covering the phrases above.

---

### 3. APP RESOLUTION & DEVICE EXISTENCE CHECK
Before openclaw.js fires any device_command, verify the device or app target
exists or is resolvable.

For ADB app actions:
- Resolve the app name to a package name by querying installed packages on the emulator
- If the name matches exactly one package, proceed
- If it matches multiple, return clarification_needed with the list
- If it matches none, return clarification_needed:
  "I couldn't find an app called '{name}' on the emulator. Did you mean one of these?
   [list installed packages] or type the exact app name."

Do not let an unresolvable app reach the adb binary.
Check if this guard exists. If not, add it.

---

### 4. ERROR HANDLING FOR PHASE 1 PATHS
Ensure these specific errors are handled and returned consistently across
chat.js, openclaw.js, and adb.js. Raw errors must never reach the user.

All errors must follow this shape:
  { "type": "error", "reason": "<machine_readable>", "message": "<human readable>" }

Reasons to cover in Phase 1:
- "emulator_offline" — adb cannot reach the emulator
- "app_not_found" — package name unresolvable after clarification
- "unparseable_intent" — chat received empty or garbled input
- "internal_error" — catch-all 500

---

### PHASE 1 DONE CONDITION
Phase 1 is complete when all of the following are true:
- User types "open YouTube" in POST /chat
- The emulator opens YouTube
- The response is { type: "skill_executed", result: ... }
- If the app is not found, chat asks which app the user meant
- If the emulator is off, the response is { type: "error", reason: "emulator_offline" }
  and the user sees "I can't reach the emulator right now. Is it running?"

Verify this manually before proceeding to Phase 2.

---

# PHASE 2 — BACKGROUND WATCHING (do not start until Phase 1 is confirmed)

Once Phase 1 is working and manually verified, implement background watchers.

---

### 1. WATCHER INTENT CLASSIFICATION
Ensure rule_classifier.js correctly classifies these as watcher intent:
- "notify me when X"
- "keep an eye on X"
- "alert me if X"
- "watch my X"

When a watcher intent is detected, do not auto-execute. Save the skill and
enter the clarification loop to collect all required parameters before registering.

---

### 2. CLARIFICATION FLOW FOR WATCHERS
When a watcher intent is detected, chain these questions one at a time
using the clarification loop until all are resolved:

1. Which repo? (if not specified) →
   "Which repo should I watch? Use owner/repo format, e.g. rahul/my-project."
2. Which branch? (if not specified) →
   "Which branch on {repo}? I'll default to main unless you specify."
3. How often? (if not specified) →
   "How often should I check? Every minute, every 5 minutes, or something else?"
4. How to notify? (if not specified) →
   "How should I notify you — in-app or push notification?"

Once all four are resolved, confirm before registering:
"I'll watch {repo} on {branch} every {interval} and notify you {channel}.
 Does that sound right?"

Only register the watcher after confirmation.

---

### 3. WATCHER ENDPOINTS
Implement if missing:
- POST /watchers
  Body: { "type": "github_commits" | "file_change", "config": { ... }, "notify_via": "push" | "in_app" }
- GET /watchers — list active watchers
- DELETE /watchers/:id — cancel a watcher

---

### 4. BACKGROUND JOB RUNNER
A cron or setInterval runner that polls each active watcher on its schedule.

For github_commits:
- Config: { repo: "owner/repo", branch: "main", poll_interval_seconds: 60 }
- Call GET https://api.github.com/repos/{owner}/{repo}/commits
- Accept GITHUB_TOKEN from env for private repos
- If the repo is private and no token is set, surface this through the
  clarification system: "That repo looks private. Add a GITHUB_TOKEN to your
  env and I'll be able to access it." Do not fail silently.
- On new commit detected → call notify()

---

### 5. NOTIFICATION DELIVERY
Implement notify(userId, { title, body, metadata }) if missing.
Default channel: WebSocket push to connected clients.
Optional channel: FCM if a server key exists in env.

Wire into the watcher runner so every fired job calls notify() automatically.
Notification must include: repo name, branch, commit author, commit message preview.

---

### 6. ERROR HANDLING FOR PHASE 2 PATHS
Extend error handling to cover watcher-specific cases:
- "invalid_watcher_config" — missing required fields in watcher body
- "repo_not_found" — GitHub returned 404
- "repo_private_no_token" — GitHub returned 401 or 403 and no token is set
- "notification_failed" — notify() could not deliver to any channel

All must follow the same error shape from Phase 1.

---

## IMPLEMENTATION RULES
- Follow the existing file structure. New logic goes in the correct existing file
  unless a new module is clearly warranted.
- Do not create a new emulator adapter. All emulator control goes through
  openclaw.js and adb.js.
- Do not stub, mock, or leave TODOs for any item.
- If an item already exists and is correct, say so and skip it.
- If an item exists but is wrong or incomplete, fix it in place.
- After each item output one line:
  ✅ Already implemented / ⚠️ Partially implemented — fixed / 🆕 Implemented from scratch
- At the end, list every file created or modified with a one-line summary of the change.