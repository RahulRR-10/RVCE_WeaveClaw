---
name: journey-watch
description: Monitor a personal journey after the user shares a destination and ETA. Use when the task is to notify 1-3 trusted Telegram contacts, attempt to share whatever current location method is available, watch for overdue arrival at ETA plus 10 minutes by default, send an overdue alert if the user has not checked in, and send an arrival confirmation when the user messages "home" or "safe".
---

# Journey Watch

Use this skill for personal safety check-in flows.

The user provides:
- destination
- estimated travel time or ETA
- optional extension to the ETA

This skill should:
1. notify trusted contacts on Telegram
2. share the best available current location or location link
3. track the ETA
4. alert contacts if the user is overdue by 10 minutes by default
5. send an arrival confirmation when the user messages `home` or `safe`

## Contacts

Load trusted contacts from `contacts.json` in this skill folder.

Current structure:
```json
{
  "trusted_contacts": [
    "@tajar_ga",
    "@saarthibhatia12",
    "@cj1611"
  ]
}
```

Use only up to 3 trusted contacts.

## Messaging style

Use calm, direct language.

Start message template:
```text
She just started her walk home, ETA 20 min — you’ll get an arrival confirmation.
```

Adapt for the actual destination and ETA. If the user prefers their own name instead of "she", use the user's name when known.

Overdue alert template:
```text
Rahul has not checked in yet and is now 10 minutes past the expected arrival time. Please check on them.
```

Arrival confirmation template:
```text
Rahul is home safe.
```

## Location strategy

Use whichever location method is actually available. Do not invent GPS or live-location capability.

Preferred order:
1. a real location or live-location method already available through the environment
2. phone-assisted Google Maps or Telegram location sharing flow
3. a current-location link or best-available location approximation
4. if no location method works, continue with messaging and clearly omit the location share

Do not block the safety flow just because precise location is unavailable.

## Core workflow

### 1) Start journey

Collect or confirm:
- destination
- ETA or travel duration
- whether the default overdue threshold is ETA + 10 minutes

Attempt to get/share location using the best available method.

Send notify messages to each trusted Telegram contact with:
- destination
- ETA
- note that arrival confirmation will follow
- location link if available

When using this phone setup, prefer `bash ~/phone_control.sh travel-text <target> "<message>"` over plain `telegram` so the contact is notified and live location is shared when available through that command.

Example combined message:
```text
Rahul just started the walk home, ETA 20 min — you’ll get an arrival confirmation.
Location: <link if available>
```

### 2) Track timing

Use a durable delayed-followup mechanism such as cron for ETA checks. Do not emulate waiting with sleep loops.

Default overdue logic:
- expected arrival = now + ETA
- overdue threshold = expected arrival + 10 minutes

If the user later extends the ETA, update the delayed check.

### 3) Arrival check-in

Treat a direct message from the user containing `home` or `safe` as arrival confirmation unless context clearly means otherwise.

When arrival is confirmed:
- cancel any pending overdue alert for the active journey
- send confirmation to all trusted contacts

### 4) Overdue alert

If the user has not checked in by the overdue threshold:
- send an alert to all trusted contacts
- mention that the user has not checked in yet
- keep the tone calm and useful

## Telegram handling

Prefer native session or messaging tools when available.

On this phone, for journey start notifications, prefer:
- `bash ~/phone_control.sh travel-text <target> "<message>"`

This is preferred over plain `telegram` for journey starts because it also attempts location sharing through the phone's supported flow.

If Telegram contact routing by username is not directly supported, mark delivery as blocked and explain the exact missing routing detail. Do not pretend a message was sent if the environment cannot actually target those contacts.

If phone UI automation is needed as a fallback:
- prefer direct app opening and focused actions
- keep visual-agent prompts short and specific
- verify the target contact before sending anything sensitive

## State management

For a real run, keep enough state to resume safely:
- active journey destination
- ETA
- overdue threshold
- chosen contacts
- whether location sharing succeeded
- whether arrival was confirmed
- cron job id or reminder id for overdue checks

A TaskFlow-style or cron-backed approach is appropriate for the waiting period.

## Safety rules

- Only message the trusted contacts listed in `contacts.json` unless the user explicitly changes them.
- Never claim location sharing succeeded unless it actually did.
- Never claim contacts were messaged unless the environment actually sent the messages.
- If routing is blocked, say so plainly and continue with whatever parts are still possible.

## Good defaults

- Default overdue threshold: ETA + 10 minutes
- Arrival phrases: `home`, `safe`
- Keep messages short and reassuring
- For journey start notifications on this phone, use `travel-text` per contact when possible
- Proceed even if location quality is approximate or unavailable
