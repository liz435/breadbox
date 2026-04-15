import type { ProjectFile } from "../db/schemas";
import type { RoutingDecision } from "./router";

export type AgentSkillId =
  | "board-pin-mapping"
  | "wiring-topology-guard"
  | "power-budget-guard"
  | "serial-debug-triage";

const SKILL_PRIORITY: AgentSkillId[] = [
  "serial-debug-triage",
  "board-pin-mapping",
  "wiring-topology-guard",
  "power-budget-guard",
];

function ledCountHint(prompt: string): number | null {
  const match = prompt.match(/\b(\d{1,2})\s*leds?\b/i);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

function includesAny(prompt: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(prompt));
}

export function selectActiveSkills(params: {
  prompt: string;
  project: ProjectFile;
  decision?: RoutingDecision;
  maxSkills?: number;
  allowSerialSkill?: boolean;
}): AgentSkillId[] {
  const {
    prompt,
    project,
    decision,
    maxSkills = 2,
    allowSerialSkill = true,
  } = params;
  const selected = new Set<AgentSkillId>();
  const promptText = prompt.toLowerCase();
  const boardTarget = project.boardState?.boardTarget ?? "arduino_uno";

  const errorIntent = includesAny(promptText, [
    /\[transpiler\]/i,
    /\[simulation\]/i,
    /\berror\b/i,
    /\bcompile\b/i,
    /\bdebug\b/i,
    /\bnot working\b/i,
    /\bserial\b/i,
  ]);
  const boardSensitive = includesAny(promptText, [
    /\banalog(read|write)?\b/i,
    /\bpwm\b/i,
    /\bpin\b/i,
    /\ba\d{1,2}\b/i,
    /\bd\d{1,2}\b/i,
    /\buno\b/i,
    /\bnano\b/i,
    /\bmega\b/i,
    /\bboard\b/i,
  ]) || boardTarget !== "arduino_uno";
  const wiringIntent = includesAny(promptText, [
    /\bwire\b/i,
    /\bwiring\b/i,
    /\bconnect\b/i,
    /\bbreadboard\b/i,
    /\bground\b/i,
    /\bgnd\b/i,
    /\brail\b/i,
  ]) || decision?.requestType === "additive" || decision?.requestType === "surgical";
  const highCurrentIntent = includesAny(promptText, [
    /\bservo\b/i,
    /\bdc[\s_-]*motor\b/i,
    /\brelay\b/i,
    /\bseven[\s_-]*segment\b/i,
    /\bneopixel\b/i,
    /\bpower budget\b/i,
    /\bovercurrent\b/i,
  ]) || (ledCountHint(promptText) ?? 0) >= 4;

  if (allowSerialSkill && errorIntent) selected.add("serial-debug-triage");
  if (boardSensitive) selected.add("board-pin-mapping");
  if (wiringIntent) selected.add("wiring-topology-guard");
  if (highCurrentIntent) selected.add("power-budget-guard");

  const ordered = SKILL_PRIORITY.filter((skill) => selected.has(skill));
  return ordered.slice(0, Math.max(0, maxSkills));
}

export function buildSkillPolicyBlock(skills: AgentSkillId[]): string {
  if (skills.length === 0) {
    return "## Skill Policy\nNo additional skills are active for this turn.";
  }
  const rules: string[] = [];
  if (skills.includes("board-pin-mapping")) {
    rules.push("- board-pin-mapping: validate board-specific analog/PWM/signal pins before writing ops.");
  }
  if (skills.includes("wiring-topology-guard")) {
    rules.push("- wiring-topology-guard: enforce one-direct-wire-per-pin and rail/bus fanout topology.");
  }
  if (skills.includes("power-budget-guard")) {
    rules.push("- power-budget-guard: block unsafe power plans; require external supply/common ground when needed.");
  }
  if (skills.includes("serial-debug-triage")) {
    rules.push("- serial-debug-triage: for compile/runtime/serial failures, apply at most one minimal fix attempt.");
  }
  rules.push("- Global budget: use at most 2 skill-guided passes this turn.");
  rules.push("- Exit fast if no board-state delta after 2 consecutive attempts.");

  return `## Skill Policy\nActive: ${skills.join(", ")}\n${rules.join("\n")}`;
}
