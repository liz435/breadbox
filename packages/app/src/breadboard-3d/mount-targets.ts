// ── Moving-node mount targets ───────────────────────────────────────────────
//
// Which of a placed part's *moving* nodes an uploaded body can be mounted onto,
// so the body inherits the simulator-driven motion (a printed pointer on a
// stepper shaft, an arm on a servo horn). Driven by the nodes the part actually
// registered in the scene registry — NOT a hardcoded type list — so every
// animated part (servo, DC motor, stepper, and any future one) is mountable
// without touching this switch. `angle`/`spin` map to the registry's
// angleNode/spinNode (see uploaded-bodies `componentTarget`).

export type MovingMountOption = { node: "angle" | "spin"; label: string }

export function movingMountOptions(
  type: string,
  has: { angle: boolean; spin: boolean },
): MovingMountOption[] {
  const options: MovingMountOption[] = []
  if (has.angle) {
    options.push({
      node: "angle",
      label:
        type === "servo"
          ? "horn (moves)"
          : type === "stepper_motor"
            ? "shaft (rotates)"
            : "moving part",
    })
  }
  if (has.spin) {
    options.push({
      node: "spin",
      label: type === "dc_motor" ? "shaft (spins)" : "spinning shaft",
    })
  }
  return options
}
