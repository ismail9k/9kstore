# Delivery settings

<!-- Read by: implement-issues, review-prs. Written by: setup-delivery, or implement-issues when the user saves a run's settings -->

## Effort
medium

## Plan approval
Off — the build starts as soon as the plan is written

## Preset
balanced

## Agents
One model for each agent. Each value is a tier (`cheap`, `standard`,
`strong`), `session`, an exact model name, `by-task` for Implementers, or —
for Review agent only — `codex:` followed by a tier or a Codex model name.

| Agent | Model | Seats it sets |
| --- | --- | --- |
| Review agent | codex:standard | pr-reviewer |

## Tiers
What each tier means on each platform this repository is built with. Add a
column when a new platform runs these skills.

| Tier | claude | codex |
| --- | --- | --- |
| cheap | sonnet | gpt-6.1-sol |
| standard | opus | gpt-6.1-sol |
| strong | fable | gpt-6.1-sol |
