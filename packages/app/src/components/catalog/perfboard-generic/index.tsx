import type { ComponentDefinition } from "@/components/component-definition"

export const perfboardGeneric: ComponentDefinition = {
  type: "perfboard_generic",
  label: "Perfboard",
  category: "other",
  description: "24×18 perfboard — every hole is its own isolated net",
  defaultPins: {},
  defaultProperties: {},
  footprint: () => ({ points: [], width: 0, height: 0 }),
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <rect x={2} y={4} width={20} height={16} rx={1} fill="#7a5a3a" stroke="#5a4028" strokeWidth={0.8} />
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2, 3, 4, 5].map((col) => (
          <circle
            key={`pb-icon-${row}-${col}`}
            cx={5 + col * 3}
            cy={7 + row * 3.5}
            r={0.7}
            fill="#1a1a1a"
          />
        )),
      )}
    </svg>
  ),
  generateSketch: () => null,
}
