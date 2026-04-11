# Electrical-Aware Agent Backlog

## Epic
Integrate electrical realism into circuit generation so agent outputs are both functionally and electrically safe.

## Ticket E1: Electrical Schemas and Profiles
- Owner: `platform-schemas`
- Effort: `M`
- Dependencies: none
- Scope:
  - Add electrical schemas in `/Users/zelong/Documents/code/dreamer/packages/schemas/src/electrical.ts`.
  - Add Uno board profile and component current profiles in:
    - `/Users/zelong/Documents/code/dreamer/packages/api/src/electrical/profiles/arduino-uno.ts`
    - `/Users/zelong/Documents/code/dreamer/packages/api/src/electrical/profiles/components.ts`
- Acceptance:
  - Exported via `/Users/zelong/Documents/code/dreamer/packages/schemas/src/index.ts`.
  - Unknown component type yields explicit warning behavior via fallback profile.

## Ticket E2: Deterministic Power Budget Analyzer
- Owner: `api-agents`
- Effort: `L`
- Dependencies: E1
- Scope:
  - Implement `/Users/zelong/Documents/code/dreamer/packages/api/src/electrical/power-budget-analyzer.ts`.
  - Analyze per-pin current, rail current, missing external supply, and recommendations.
- Acceptance:
  - Detects pin overcurrent, rail overcurrent, and high-current load on Arduino 5V.
  - Emits actionable remediation guidance.

## Ticket E3: Agent Tool + Hard Guardrail
- Owner: `api-agents`
- Effort: `M`
- Dependencies: E2
- Scope:
  - Add `analyze_power_budget` tool in `/Users/zelong/Documents/code/dreamer/packages/api/src/agents/core/tools.ts`.
  - Add electrical blocking gate in `/Users/zelong/Documents/code/dreamer/packages/api/src/agents/core/agent.ts`.
- Acceptance:
  - Unsafe plans are blocked from producing applied ops.
  - Assistant response includes top electrical issues and fix direction.

## Ticket E4: Template Safety Upgrade
- Owner: `api-agents`
- Effort: `S`
- Dependencies: E2
- Scope:
  - Update servo template in `/Users/zelong/Documents/code/dreamer/packages/api/src/agents/circuit-templates.ts` to use external power + common ground.
- Acceptance:
  - Servo template no longer powers motor rail directly from Arduino 5V.

## Ticket E5: Electrical Eval Metrics
- Owner: `eval-infra`
- Effort: `M`
- Dependencies: E2
- Scope:
  - Add electrical analyzer in `/Users/zelong/Documents/code/dreamer/packages/api/src/eval/analyzers/electrical-analyzer.ts`.
  - Integrate into:
    - `/Users/zelong/Documents/code/dreamer/packages/api/src/eval/types.ts`
    - `/Users/zelong/Documents/code/dreamer/packages/api/src/eval/run-evaluator.ts`
    - `/Users/zelong/Documents/code/dreamer/packages/api/src/eval/batch-evaluator.ts`
- Acceptance:
  - Run eval includes electrical metrics.
  - Summary top-issues includes electrical classes.

## Ticket E6: Analyzer Tests
- Owner: `api-agents`
- Effort: `M`
- Dependencies: E2
- Scope:
  - Add tests in `/Users/zelong/Documents/code/dreamer/packages/api/src/electrical/__tests__/power-budget-analyzer.test.ts`.
- Acceptance:
  - Covers at minimum:
    - servo without external supply -> error
    - 10 LEDs on one pin -> overcurrent error
    - external supply + common ground for servo -> no external-power error

## Ticket E7: UX Surface (Next)
- Owner: `app-ui`
- Effort: `L`
- Dependencies: E3
- Scope:
  - Add electrical report panel and block run/upload only for `error` severity.
- Acceptance:
  - Users can see issues and fixes inline before running/uploading.

## Ticket E8: SPICE Cross-Validation (Next)
- Owner: `sim-engine`
- Effort: `L`
- Dependencies: E2
- Scope:
  - Add SPICE connectivity sanity pass to confirm return paths and supply realism.
- Acceptance:
  - Reports connectivity/rail anomalies as secondary diagnostics.

## Delivery Plan
1. Phase 1: E1, E2, E3, E4, E6
2. Phase 2: E5, E7
3. Phase 3: E8

