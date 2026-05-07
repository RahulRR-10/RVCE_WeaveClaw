---
name: simple-travel-planning
description: Plan a simple day trip or short outing using the phone's local tools. Use when the task is to check the user's calendar for conflicts, check destination weather, find activities and food, organize a day plan, save it into the Notes app, and set a reminder to review the plan before leaving.
---

# Simple Travel Planning

Use the phone-first workflow in this order:
1. Check schedule
2. Check weather
3. Find activities and food
4. Create a practical day plan
5. Save the plan in Notes
6. Set a reminder

Keep the workflow concise and practical. Prefer direct phone-control commands over visual automation. Use the visual agent only when a direct command or deep link cannot complete the step.

## Core rules

- Use `bash ~/phone_control.sh` and `bash ~/phone_agent.sh` for device work.
- Prefer deep links with `open-url` for search, Maps, and web lookups.
- Use separate calendar commands for each day when checking multiple days.
- Consider weather and travel distance when building the plan.
- Save a clean, readable summary in Notes.
- Ask before creating reminders or notes only if the user has not clearly asked for the travel plan flow to complete end-to-end.

## Step 1: Check schedule

Check the relevant date in the calendar first.

For one day:
```bash
bash ~/phone_control.sh calendar 2026-05-06
```

For multiple days, run separate commands day by day instead of one date-range query:
```bash
bash ~/phone_control.sh calendar 2026-05-06
bash ~/phone_control.sh calendar 2026-05-07
```

Look for:
- existing bookings
- all-day events
- time windows already blocked
- location hints from event titles or locations

If the user already has dense plans, build around them instead of overwriting the day.

## Step 2: Check weather

Use the weather skill if available in the parent environment. If not, search directly.

Preferred direct lookup:
```bash
bash ~/phone_control.sh open-url "https://www.google.com/search?q=weather+in+DESTINATION"
```

You may also use web search/fetch outside the phone when faster for drafting, but phone commands are preferred when the task is explicitly about using device flows.

Focus on:
- rain chance
- temperature range
- wind/harsh weather
- whether outdoor activities are practical

## Step 3: Find activities and food

Use Google search and Google Maps deep links before visual automation.

Search examples:
```bash
bash ~/phone_control.sh open-url "https://www.google.com/search?q=best+things+to+do+in+DESTINATION"
bash ~/phone_control.sh open-url "https://www.google.com/maps/search/?api=1&query=best+lunch+near+DESTINATION"
bash ~/phone_control.sh open-url "https://www.google.com/maps/search/?api=1&query=best+dinner+near+DESTINATION"
```

Choose:
- one morning activity
- one lunch place
- one afternoon activity
- one dinner place

Prefer places that:
- fit the weather
- reduce backtracking
- are popular or clearly well-rated
- are realistic for the user’s available time

## Step 4: Create the plan

Organize in this structure:
- Morning activity
- Lunch
- Afternoon activity
- Dinner

Include for each item:
- name
- rough time
- why it fits
- map/search link when useful

If weather is bad, shift toward indoor options. If travel is long, cluster activities geographically.

## Step 5: Save the plan in Notes

Use the Notes commands instead of UI tapping.

Create a note:
```bash
bash ~/phone_control.sh notes create "Trip Plan - TITLE" "BODY"
```

Or append to an existing note:
```bash
bash ~/phone_control.sh notes append "Trip Plan - TITLE" "BODY"
```

Recommended note structure:
```text
Trip Plan - DESTINATION - DATE

Schedule check:
- ...

Weather:
- ...

Plan:
Morning:
- ...

Lunch:
- ...

Afternoon:
- ...

Dinner:
- ...

Links:
- Maps: ...
- Backup option: ...

Reminder:
- Check this plan before leaving.
```

Keep the note readable on mobile.

## Step 6: Set a reminder

Use the clock alarm command when the user wants an on-device reminder.

Example:
```bash
bash ~/phone_control.sh clock alarm 08 00 "Check trip plan"
```

Choose a reminder time that is before departure, not during the outing.

If the exact departure time is unknown, set a reasonable review reminder and say what assumption was made.

## Visual fallback

Use the visual agent only when direct commands are insufficient, for example:
- reading dynamic app UI that has no direct command
- tapping a specific result inside Maps or a browser
- handling app flows where deep links stop short

Keep prompts short and specific:
```bash
bash ~/phone_agent.sh "Tap the first Maps result for the lunch place"
```

## Output expectations

When completing the task for the user, provide:
- calendar findings
- weather summary
- chosen activities and food spots
- final morning → lunch → afternoon → dinner plan
- confirmation that the note was saved
- confirmation that the reminder was set

## Good defaults

- Prefer separate per-day calendar checks.
- Prefer Google Maps search links for places.
- Prefer indoor backups during uncertain weather.
- Prefer short travel hops over ambitious itineraries.
