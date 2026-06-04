# Skill: board-pin-mapping

## Purpose

Normalize and validate Arduino pin choices against the active board target (`arduino_uno`, `arduino_nano`, `arduino_mega_2560`) before wiring or code generation.

## Trigger

Run this skill when any of the following is true:

- A request includes pin assignments or wire endpoints from Arduino.
- The board target was changed this turn.
- Sketch contains `analogRead`, `analogWrite`, `pinMode`, or direct pin literals.

## Inputs

- Active `boardTarget`.
- Current board wires/components.
- Candidate pin assignments from plan or draft ops.

## Required Checks

1. Pin ID validity for the board target.
2. Analog pin validity for `analogRead`.
3. PWM pin validity for `analogWrite`.
4. Reserved serial pin warning for `D0/D1` usage.
5. Mapping consistency between labels (`A0`) and numeric IDs.

## Output Contract

Return:

- `status`: `pass` | `fixed` | `blocked`
- `findings`: list of invalid/inconsistent pins
- `actions`: corrected pin map suggestions
- `stop_reason`: convergence, invalid target, or budget

## Hard Limits

- Max `1` invocation per turn.
- Max `1` correction pass.
- No more than `2` tool calls (read-only preferred).

## Exit Criteria

- Exit `pass` if all checks succeed.
- Exit `fixed` after one correction pass.
- Exit `blocked` if unresolved after one pass.

