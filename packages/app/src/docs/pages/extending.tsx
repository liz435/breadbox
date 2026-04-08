import { DocsLayout, PageTitle, Section, Table, CodeBlock, Note, Warn } from "@/docs/docs-layout"

export function ExtendingPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Adding Components"
        subtitle="How to register a new component type so it works everywhere in Dreamer."
      />

      <Section title="Overview">
        <p className="text-sm text-gray-300 leading-relaxed">
          All component behaviour is defined in one place:{" "}
          <code>packages/app/src/components/registry.tsx</code>. A single{" "}
          <code>ComponentDefinition</code> object per component type drives the breadboard footprint,
          SPICE simulation, sketch generation, schematic symbol, inspector defaults, accent colour,
          and palette icon. Every consuming system reads from the registry — you never touch
          individual switch statements.
        </p>
        <Note>
          Before this system, adding a component required edits to 14 separate files.
          Now it requires editing 2: the schema enum and the registry.
        </Note>
      </Section>

      <Section title="Step 1 — Add the type to the schema">
        <p className="text-sm text-gray-400 mb-2">
          File: <code>packages/schemas/src/arduino.ts</code>
        </p>
        <CodeBlock code={`export const componentTypeSchema = z.enum([
  // ... existing types ...
  "my_sensor",   // ← add your type here
])`} lang="ts" />
        <p className="text-sm text-gray-400 mt-2">
          This is the only place the type string is declared authoritatively. TypeScript will
          enforce it everywhere via <code>ComponentType</code>.
        </p>
      </Section>

      <Section title="Step 2 — Add a definition to the registry">
        <p className="text-sm text-gray-400 mb-2">
          File: <code>packages/app/src/components/registry.tsx</code> — add one object to{" "}
          <code>COMPONENT_REGISTRY</code>.
        </p>
        <CodeBlock code={`{
  type: "my_sensor",
  label: "My Sensor",

  // ── Pins (all start null = unassigned) ──────────────────────
  defaultPins: { vcc: null, signal: null, gnd: null },
  defaultProperties: { sensitivity: 50 },

  // ── Breadboard footprint ─────────────────────────────────────
  // Return which grid holes the component occupies and its pixel size.
  footprint: (row, col) => ({
    points: [
      { row, col },
      { row, col: col + 1 },
      { row, col: col + 2 },
    ],
    width: HOLE_SPACING * 3,
    height: HOLE_SPACING * 2,
  }),

  // ── Palette icon (SVG) ────────────────────────────────────────
  paletteIcon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <rect x={2} y={8} width={20} height={8} rx={2} fill="#1e3a5f" stroke="#3b82f6" strokeWidth={1} />
    </svg>
  ),

  // ── SPICE netlist (optional) ──────────────────────────────────
  // Return null to skip simulation for this component.
  buildNetlist: (comp, { footprint, resolveNode }) => {
    const nodeA = resolveNode(footprint.points[0])
    const nodeB = resolveNode(footprint.points[2])
    return {
      lines: [\`R_\${comp.id.slice(0, 20)} \${nodeA} \${nodeB} 10000\`],
      nodeA,
      nodeB,
    }
  },

  // ── Electrical state (optional) ───────────────────────────────
  // Compute isActive, brightness, etc. from the solved circuit.
  // Return null to use the generic fallback (isActive: false).
  computeElectricalState: (_comp, { currentMa, voltageDrop }) => ({
    isActive: currentMa > 0.1,
    voltage: voltageDrop,
    current: currentMa,
  }),

  // ── Arduino sketch (optional) ────────────────────────────────
  // Return null if this component needs no sketch code.
  generateSketch: (comp) => {
    const pin = comp.pins.signal
    if (pin == null) return null
    return {
      setupLines: [\`  // My Sensor on pin \${pin}\`],
      hasPin: true,
    }
  },

  // ── Schematic (optional) ─────────────────────────────────────
  // Omit schematicSymbol to exclude from schematic view.
  // schematicSymbol: "resistor",
  // schematicValue: () => "10kΩ sensor",

  // ── Accent colour for breadboard hole indicators (optional) ──
  accentColor: "#3b82f6",
},`} lang="ts" />
      </Section>

      <Section title="Step 3 — Optional: custom renderer">
        <p className="text-sm text-gray-300 leading-relaxed">
          If the generic grey rectangle isn't enough visually, create a renderer in{" "}
          <code>packages/app/src/breadboard/component-renderers/</code> and register it in{" "}
          <code>component-renderers/index.tsx</code>:
        </p>
        <CodeBlock code={`// my-sensor-renderer.tsx
export function MySensorRenderer({ component, isSelected }: RendererProps) {
  const { x, y } = gridToPixel({ row: component.y, col: component.x })
  return (
    <g>
      <rect x={x - 12} y={y - 8} width={24} height={16} rx={2}
        fill="#1e3a5f" stroke={isSelected ? "#3b82f6" : "#374151"} strokeWidth={1} />
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle"
        fontSize={4} fill="#93c5fd" fontFamily="monospace">SENS</text>
    </g>
  )
}

// index.tsx — add one line:
my_sensor: MySensorRenderer,`} lang="tsx" />
      </Section>

      <Section title="Step 4 — Optional: custom inspector">
        <p className="text-sm text-gray-300 leading-relaxed">
          For type-specific property editors, add a small component and a conditional render in{" "}
          <code>packages/app/src/panels/inspector.tsx</code>. If you skip this, all pins are
          shown via the generic pin inspector.
        </p>
        <CodeBlock code={`// In inspector.tsx — add your inspector component:
function MySensorInspector({ component, onUpdate }) {
  return (
    <>
      <PropertyRow label="Signal Pin">
        <PinSelect value={component.pins.signal ?? null}
          onChange={pin => onUpdate({ pins: { ...component.pins, signal: pin } })} />
      </PropertyRow>
    </>
  )
}

// Then wire it up in the main Inspector render:
{component.type === "my_sensor" && (
  <MySensorInspector component={component} onUpdate={onUpdate} />
)}

// Add to the exclusion list so GenericPinInspector doesn't also render:
{!["led", "resistor", ..., "my_sensor"].includes(component.type) && (
  <GenericPinInspector ... />
)}`} lang="tsx" />
      </Section>

      <Section title="Step 5 — Add a docs page (recommended)">
        <p className="text-sm text-gray-300 leading-relaxed">
          Copy an existing page from{" "}
          <code>packages/app/src/docs/pages/components/</code>, fill in the fields, then
          register it in <code>docs-layout.tsx</code> (NAV array) and{" "}
          <code>docs-router.tsx</code> (ROUTES map).
        </p>
      </Section>

      <Section title="ComponentDefinition fields">
        <Table
          headers={["Field", "Type", "Required", "Description"]}
          rows={[
            ["type", "string", "Yes", "Must match the zod enum in schemas"],
            ["label", "string", "Yes", "Shown in inspector title and palette"],
            ["defaultPins", "Record<string, null>", "Yes", "Pin names — all start unassigned"],
            ["defaultProperties", "Record<string, unknown>", "No", "Initial property values"],
            ["footprint", "(row, col) => ComponentFootprint", "Yes", "Grid holes + pixel size"],
            ["paletteIcon", "ReactNode", "Yes", "SVG icon shown in palette"],
            ["accentColor", "string", "No", "Hex colour for occupied-hole dots"],
            ["buildNetlist", "(comp, ctx) => NetlistOutput | null", "No", "SPICE elements — return null to skip simulation"],
            ["spicePrefix", "string", "No", `"R" or "D" — used to look up element current. Defaults to "R"`],
            ["computeElectricalState", "(comp, ctx) => ElectricalOutput | null", "No", "Computes isActive, brightness, warnings. Return null for generic fallback"],
            ["generateSketch", "(comp) => SketchOutput | null", "No", "Arduino sketch lines — return null to skip"],
            ["schematicSymbol", "SchematicSymbolType", "No", "Symbol type for schematic view — omit to exclude"],
            ["schematicValue", "(comp) => string | undefined", "No", "Value label shown next to schematic symbol"],
          ]}
        />
      </Section>

      <Section title="SketchOutput fields">
        <Table
          headers={["Field", "Type", "Description"]}
          rows={[
            ["globalLines", "string[]", "Lines added once at the top of the file (includes, global declarations like Servo myServo;)"],
            ["setupLines", "string[]", "Lines inside setup()"],
            ["loopLines", "string[]", "Lines inside loop()"],
            ["hasPin", "boolean", "Set true when at least one pin is assigned — prevents the 'no pins' fallback sketch"],
          ]}
        />
      </Section>

      <Section title="NetlistOutput fields">
        <Table
          headers={["Field", "Type", "Description"]}
          rows={[
            ["lines", "string[]", "SPICE element lines, e.g. R_abc net_1 net_2 220"],
            ["nodeA", "string", "Primary SPICE node A — used by circuit solver to read voltage"],
            ["nodeB", "string", "Primary SPICE node B"],
          ]}
        />
        <Note>
          Use <code>ctx.resolveNode(footprint.points[n])</code> to get the SPICE node name for
          each pin. Unconnected points resolve to a unique isolated node, not ground.
        </Note>
      </Section>

      <Section title="ElectricalOutput fields">
        <Table
          headers={["Field", "Type", "Description"]}
          rows={[
            ["isActive", "boolean", "Whether current is meaningfully flowing"],
            ["voltage", "number (V)", "Voltage drop across the component"],
            ["current", "number (mA)", "Current in milliamps"],
            ["isReversed", "boolean?", "True if voltage is negative (useful for diodes/LEDs)"],
            ["brightness", "number? (0–1)", "Drive level — used by LED/buzzer renderers"],
            ["warnings", "array?", "Circuit warnings: no_resistor, reverse_polarity, overcurrent, open_circuit"],
            ["emitCurrentPath", "boolean?", "Set true to show animated current-flow arrows on wires"],
          ]}
        />
      </Section>

      <Section title="Arduino library system">
        <p className="text-sm text-gray-300 leading-relaxed mb-2">
          Arduino libraries are provided as built-in JavaScript classes and objects injected into the
          sketch execution scope. They are defined in{" "}
          <code>packages/app/src/simulator/arduino-stdlib.ts</code>.
        </p>
        <Table
          headers={["Library", "Implementation", "State tracked"]}
          rows={[
            ["Servo", "ServoClass — attach, write, read, detach", "servos Map (pin, angle)"],
            ["LiquidCrystal", "LiquidCrystalClass — begin, setCursor, print, clear", "lcd buffer (cols, rows, cursor, textBuffer)"],
            ["EEPROM", "Object — read, write, update, length", "1KB Uint8Array (persists during session)"],
            ["Wire (I2C)", "Object — begin, beginTransmission, write, endTransmission, requestFrom, read", "i2cBus Map (address → device)"],
            ["SPI", "Object — begin, transfer, beginTransaction, endTransaction", "Settings (bitOrder, clockDiv, dataMode)"],
            ["Stepper", "StepperClass — setSpeed, step", "position, speed, pin states"],
          ]}
        />
        <p className="text-sm text-gray-400 mt-3 mb-2">
          <strong>Adding a built-in library (developer):</strong> Add a class or object in{" "}
          <code>arduino-stdlib.ts</code>, export it in the return object, and add its header to{" "}
          <code>KNOWN_LIBRARIES</code> in <code>arduino-transpiler.ts</code>.
        </p>
        <p className="text-sm text-gray-400 mb-2">
          <strong>Adding a custom library (user):</strong> Open the Libraries tab, click +, name it
          (e.g. <code>MyUtils.h</code>), and write C++ code. Use{" "}
          <code>#include &quot;MyUtils.h&quot;</code> (double quotes) in your sketch. Custom libraries
          are stored per-project and auto-saved.
        </p>
        <p className="text-sm text-gray-300 leading-relaxed">
          The transpiler supports a restricted C++ subset including simple class and struct
          definitions, PascalCase class instantiation (<code>Servo motor;</code>), and all standard
          Arduino functions. Pointers, templates, and namespaces are not supported.
        </p>
      </Section>

      <Section title="Files changed when adding a component">
        <Table
          headers={["File", "Change", "When"]}
          rows={[
            ["packages/schemas/src/arduino.ts", "Add type to componentTypeSchema enum", "Always"],
            ["packages/app/src/components/registry.tsx", "Add ComponentDefinition object", "Always"],
            ["packages/app/src/breadboard/component-renderers/", "Add renderer file + register in index.tsx", "Optional — for custom visuals"],
            ["packages/app/src/panels/inspector.tsx", "Add inspector component + conditional render", "Optional — for custom property editors"],
            ["packages/app/src/docs/pages/components/", "Add documentation page", "Recommended"],
            ["packages/app/src/docs/docs-layout.tsx", "Add nav entry to NAV array", "If docs page added"],
            ["packages/app/src/docs/docs-router.tsx", "Add route to ROUTES map", "If docs page added"],
          ]}
        />
        <Warn>
          Do <strong>not</strong> edit <code>breadboard-grid.ts</code>,{" "}
          <code>netlist-builder.ts</code>, <code>circuit-solver.ts</code>,{" "}
          <code>board-to-sketch.ts</code>, <code>schematic-layout.ts</code>,{" "}
          <code>breadboard-canvas.tsx</code>, or <code>component-palette.tsx</code> for a new
          component. They all read from the registry automatically.
        </Warn>
      </Section>
    </DocsLayout>
  )
}
