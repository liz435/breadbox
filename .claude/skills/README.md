# Arduino Agent Skills (Minimal Set)

This folder contains a minimal skill set optimized for reliability and cost for Dreamer Arduino agents.

## Included Skills

- `board-pin-mapping`
- `wiring-topology-guard`
- `power-budget-guard`
- `serial-debug-triage`

## Recommended Invocation Order

1. `board-pin-mapping`
2. `wiring-topology-guard`
3. `power-budget-guard`
4. `serial-debug-triage` (error-only)

## Global Cost Controls

- Max `2` skill invocations per agent turn.
- Max `1` retry per skill.
- Stop when there is no state delta after `2` consecutive attempts.
- If a safety issue is unresolved after one repair attempt, return `blocked`.

