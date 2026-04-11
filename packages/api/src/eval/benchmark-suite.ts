export type BenchmarkTurn = {
  prompt: string;
};

export type BenchmarkScenario = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  turns: BenchmarkTurn[];
};

export const DEFAULT_BENCHMARK_SUITE: BenchmarkScenario[] = [
  {
    id: "traffic-light-followup",
    title: "Traffic Light Follow-up",
    description:
      "Exercises template selection on turn one and an additive edit on turn two.",
    tags: ["breadboard", "template", "followup", "edit"],
    turns: [
      { prompt: "Build a traffic light circuit with red, yellow, and green LEDs." },
      { prompt: "Add a buzzer that beeps whenever the red LED turns on." },
    ],
  },
  {
    id: "servo-pot-refine",
    title: "Servo Pot Refine",
    description:
      "Checks whether an initial build plus a surgical refinement stays cheap and accurate.",
    tags: ["breadboard", "build", "surgical"],
    turns: [
      { prompt: "Build a circuit where a potentiometer controls a servo motor." },
      { prompt: "Change it so the servo moves more smoothly and a bit slower." },
    ],
  },
  {
    id: "graph-led-sequence",
    title: "Graph LED Sequence",
    description:
      "Covers the visual-graph path and a follow-up modification on the same thread.",
    tags: ["graph", "followup"],
    turns: [
      { prompt: "Create a visual graph that blinks an LED on pin 13." },
      { prompt: "Add a second LED on pin 12 that alternates with the first." },
    ],
  },
  {
    id: "conversation-then-edit",
    title: "Conversation Then Edit",
    description:
      "Measures whether a light explanatory turn stays compact before a real edit.",
    tags: ["chat_only", "followup", "breadboard"],
    turns: [
      { prompt: "Build a simple button-controlled LED circuit." },
      { prompt: "Explain what the sketch is doing in one short paragraph." },
      { prompt: "Now add a short debounce delay so the LED is less flickery." },
    ],
  },
];

export const SMOKE_BENCHMARK_SUITE: BenchmarkScenario[] = [
  {
    id: "template-smoke",
    title: "Template Smoke",
    description:
      "Offline smoke test for the benchmark runner using the deterministic template path only.",
    tags: ["smoke", "template", "offline"],
    turns: [
      { prompt: "Build a traffic light circuit with red, yellow, and green LEDs." },
    ],
  },
];

export function getBenchmarkSuite(name: string | undefined): BenchmarkScenario[] {
  const normalized = (name ?? "default").trim().toLowerCase();
  if (normalized === "default") {
    return DEFAULT_BENCHMARK_SUITE;
  }
  if (normalized === "smoke") {
    return SMOKE_BENCHMARK_SUITE;
  }
  throw new Error(`Unknown benchmark suite: ${name}`);
}
