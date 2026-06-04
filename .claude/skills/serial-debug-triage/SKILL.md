# Skill: serial-debug-triage

## Purpose

Resolve compile/runtime/serial monitor failures quickly with a single minimal fix path and strict loop prevention.

## Trigger

Run this skill only when one of these appears:

- `[TRANSPILER]` error
- `[SIMULATION]` runtime error
- No serial response when a serial-driven sketch is expected

## Inputs

- Latest error text and line number.
- Current sketch code.
- Optional serial input command used by the user.

## Required Checks

1. Unsupported transpiler patterns (for example pass-by-reference `&`).
2. Missing or wrong `Serial.begin(...)`.
3. Control flow that prevents serial handling.
4. Pin mismatch between sketch and wiring for serial-related behavior.

## Output Contract

Return:

- `status`: `pass` | `fixed` | `blocked`
- `findings`: root-cause classification
- `actions`: one minimal patch suggestion or patch op
- `stop_reason`: fixed, unchanged-error, or budget

## Hard Limits

- Max `1` patch attempt.
- Max `1` re-check.
- Stop immediately if the same error signature persists.

## Exit Criteria

- Exit `fixed` when error signature changes to success.
- Exit `blocked` when the same error persists after one patch.
- Include the next manual validation command/input in output.

