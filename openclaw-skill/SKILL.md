---
name: WeaveClaw
description: "WeaveClaw automation engine. Use when user wants to create, manage, or execute automation skills. Handles natural language to automation workflow conversion, conflict detection, and behavioral learning. WeaveClaw backend runs at http://localhost:3000."
---

# WeaveClaw Skill

WeaveClaw is a local automation engine. You can interact with it using these endpoints:

## Create or Execute a Skill via Chat

POST http://localhost:3000/chat
Body: `{ "message": "<user intent>", "session_id": "<unique id>" }`
Returns: `skill_created`, `skill_executed`, `clarification_needed`, or `conflict_detected`

## List All Skills

GET http://localhost:3000/skills

## Execute a Skill Manually

POST http://localhost:3000/skills/<skill_id>/execute

## View Suggestions

GET http://localhost:3000/suggestions

## Accept a Suggestion

POST http://localhost:3000/suggestions/<id>/accept

## When to Use This Skill

- When user says "create an automation", "add a skill", or "set up a routine"
- When user says "I'm going to sleep" or "start focus mode" and may want to execute an existing automation
- When user asks about their automations or suggestions

Always forward user intent to `POST /chat` first. Let WeaveClaw handle classification.
