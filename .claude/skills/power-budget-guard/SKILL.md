# Skill: power-budget-guard

## Purpose

Prevent unsafe electrical plans by validating per-pin current, rail load, and external supply requirements before finalizing a circuit.

## Trigger

Run this skill when:

- High-current parts appear (`servo`, `dc_motor`, `relay`, `seven_segment`, large LED sets).
- Load count is greater than `3`.
- User asks for safety check or physical deploy readiness.

## Inputs

- Current board state (components/wires).
- Electrical analyzer report.

## Required Checks

1. Per-pin current against board limits.
2. 5V/3V3 rail overcurrent checks.
3. External-power-required component validation.
4. Common-ground validation between Arduino and external supply.
5. Power source path sanity (no signal pin powering loads).

## Output Contract

Return:

- `status`: `pass` | `fixed` | `blocked`
- `findings`: safety issues with severity
- `actions`: minimal rewiring/power-source fixes
- `stop_reason`: safe, unresolved-risk, or budget

## Hard Limits

- Run exactly once pre-finalize.
- Max `1` repair pass.
- No sketch changes in this skill.

## Exit Criteria

- Exit `pass` when no error-level safety findings.
- Exit `fixed` when one repair pass clears all errors.
- Exit `blocked` if any error-level finding remains.

