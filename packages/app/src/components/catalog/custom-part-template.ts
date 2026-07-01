// Starter templates for a new custom part.
//
// DSL form (declarative, portable — copy-paste to/from a chatbot, MCP-safe) and
// code form (a host-SDK module, full power). The id after "custom:" becomes the
// filename and the registered type.

export const CUSTOM_PART_DSL_TEMPLATE = `{
  "type": "custom:my-sensor",
  "label": "My Sensor",
  "category": "input",
  "pins": [
    { "name": "vcc", "dx": 0, "dy": 0, "role": "power" },
    { "name": "gnd", "dx": 0, "dy": 1, "role": "ground" },
    { "name": "sig", "dx": 0, "dy": 2, "role": "analog" }
  ],
  "properties": { "value": 50 },
  "svg": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 36'><rect x='2' y='2' width='8' height='32' rx='2' fill='#334155' stroke='#94a3b8' stroke-width='0.5'/><circle cx='6' cy='8' r='1.5' fill='#38bdf8'/></svg>",
  "electrical": {
    "elements": [
      { "kind": "source", "plus": "sig", "minus": "0", "volts": "value / 100 * 5" }
    ]
  },
  "sketch": {
    "loop": ["int v = analogRead({{pin.sig}}); // {{name}}"]
  }
}
`

// Code form (the host-SDK module).
export const CUSTOM_PART_TEMPLATE = `// A custom Breadbox component. Edit and Save — it appears in the palette
// immediately and simulates like a built-in part.

export default (host) =>
  host.defineComponent({
    // Unique, kebab-case. The part after "custom:" is the id/filename.
    type: "custom:my-sensor",
    label: "My Sensor",
    category: "input",

    // Pins: name + grid offset (dx = columns, dy = rows) from placement origin.
    pins: [
      { name: "vcc", dx: 0, dy: 0, role: "power" },
      { name: "gnd", dx: 0, dy: 1, role: "ground" },
      { name: "sig", dx: 0, dy: 2, role: "analog" },
    ],

    // User-tweakable properties (shown in the inspector).
    properties: { value: 50 },

    // SPICE contribution. api.pin(name) -> circuit node; api.prop(name, fallback).
    // Here the signal pin is driven to value/100 * 5V so analogRead sees it.
    buildNetlist: (comp, ctx, api) => {
      const sig = api.pin("sig");
      const volts = (api.prop("value", 50) / 100) * 5;
      return { lines: [\`V_\${api.id} \${sig} 0 \${volts}\`], nodeA: sig, nodeB: "0" };
    },

    // Arduino code generated for this part.
    generateSketch: (comp) => ({
      loopLines: [\`  int v = analogRead(\${comp.pins.sig}); // \${comp.name}\`],
      hasPin: true,
    }),
  });
`
