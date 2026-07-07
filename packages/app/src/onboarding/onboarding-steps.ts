// ── Onboarding steps ─────────────────────────────────────────────────────
//
// Ordered coach-mark steps for the first-run tour. Each `anchor` is the value
// of a `data-onboarding="…"` attribute placed on the real UI element it points
// at; the tour spotlights that element and parks the callout beside it. A step
// with no `anchor` (or whose anchor isn't on screen) renders centered.
//
// Anchors live in:
//   modes      → toolbar/edit-toolbar.tsx (workspace-mode group)
//   components → panels/project-panel.tsx
//   canvas     → breadboard/breadboard-panel.tsx
//   sketch     → editor/sketch-editor.tsx
//   run        → toolbar/play-controls.tsx
//   ai-chat    → toolbar/bottom-toolbar.tsx (the ✨ AI toggle)

export type OnboardingStep = {
  /** Stable id (used for keys + tests). */
  id: string
  /** `data-onboarding` value to spotlight, or undefined to center the card. */
  anchor?: string
  title: string
  body: string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    anchor: "canvas",
    title: "Welcome to Breadbox",
    body: "We dropped a ready-to-run blink circuit on your board — an LED and a resistor wired to an Arduino Uno. Here's a 30-second tour of where everything lives.",
  },
  {
    id: "modes",
    anchor: "modes",
    title: "Workspace modes",
    body: "Switch between 2D, 3D, and Debug. Each rearranges the panels for the task at hand — you're in 2D now, which is where you wire circuits and write code.",
  },
  {
    id: "components",
    anchor: "components",
    title: "Components",
    body: "Drag parts from here onto the breadboard — LEDs, resistors, sensors, motors and more. Drop one on the canvas, then connect its pins to wire up a circuit.",
  },
  {
    id: "sketch",
    anchor: "sketch",
    title: "Sketch editor",
    body: "Your Arduino sketch lives here. It's kept in sync with the board automatically, and you can edit it freely — this one already blinks the LED on pin 13.",
  },
  {
    id: "run",
    anchor: "run",
    title: "Run the simulation",
    body: "Press Play to compile and simulate — no hardware needed. Watch the LED blink on the board and the Serial Monitor come alive. Hit Stop to end the run.",
  },
  {
    id: "ai-chat",
    anchor: "ai-chat",
    title: "Build with AI",
    body: "Switch to the ✨ AI tab to ask the agent to build or fix circuits for you. Prefer your own Claude? Use “Connect Claude (MCP)” from the command palette (⌘K).",
  },
]
