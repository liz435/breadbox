# Skill: wiring-topology-guard

## Purpose

Enforce robust breadboard wiring topology to avoid shorts, ambiguous nets, and excessive direct fanout from Arduino pins.

## Trigger

Run this skill when:

- New wires are added or existing wires are updated.
- Circuit has `>= 2` non-board components.
- A prior analyzer reported fanout/bus short/floating issues.

## Inputs

- Current board components and wires.
- Proposed wire ops for this turn.

## Required Checks

1. One direct wire per Arduino pin; fan out via row/rail net.
2. Shared power/ground distributed via rails.
3. No mixed-source pins (signal + power/ground) on same bus segment.
4. Critical component pins are not floating.
5. Duplicate/overlapping wires are removed or merged.

## Output Contract

Return:

- `status`: `pass` | `fixed` | `blocked`
- `findings`: topology violations
- `actions`: minimal wire edits to fix violations
- `stop_reason`: converged, no-state-delta, or budget

## Hard Limits

- Max `6` write ops.
- Max `2` analysis passes.
- Abort if second pass has no board-state delta.

## Exit Criteria

- Exit `pass` if no violations.
- Exit `fixed` if all violations resolved in budget.
- Exit `blocked` if unresolved after second pass.

