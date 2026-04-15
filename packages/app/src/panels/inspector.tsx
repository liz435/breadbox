import { useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { useBoard } from "@/store/board-context";
import { useGraph } from "../store/graph-context";
import { GraphInspector } from "./graph-inspector";
import { pinStateStore } from "@/simulator/pin-state-store";
import { buttonPressStore, useButtonPressed } from "@/simulator/button-press-store";
import { usePinState } from "@/simulator/use-pin-state";
import { analyzeButtonWiring } from "@/breadboard/component-pin-resolver";
import { useCircuitAnalysis } from "@/simulator/circuit-analysis-hook";
import { useElectricalReport } from "@/electrical/power-budget";
import type { BoardComponent, Wire } from "@dreamer/schemas";

// ── Wire colors ──
const WIRE_COLORS = [
  { label: "Yellow", value: "#fbbf24" },
  { label: "Red", value: "#ef4444" },
  { label: "Black", value: "#1a1a1a" },
  { label: "Green", value: "#22c55e" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Orange", value: "#f97316" },
  { label: "White", value: "#e5e5e5" },
  { label: "Purple", value: "#a855f7" },
];

// ── Common resistor values ──
const RESISTOR_VALUES = [100, 220, 330, 470, 1000, 2200, 4700, 10000, 47000, 100000];

// ── LED colors ──
const LED_COLORS = [
  { label: "Red", value: "#ef4444" },
  { label: "Green", value: "#22c55e" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Yellow", value: "#eab308" },
  { label: "White", value: "#f8fafc" },
  { label: "Orange", value: "#f97316" },
];

// ── Pin options for dropdowns ──
const DIGITAL_PINS = Array.from({ length: 14 }, (_, i) => ({ label: `D${i}`, value: i }));
const ANALOG_PINS = Array.from({ length: 6 }, (_, i) => ({ label: `A${i}`, value: 14 + i }));
const ALL_PINS = [...DIGITAL_PINS, ...ANALOG_PINS];
const GROUND_PIN_OPTIONS = [
  { label: "GND (-3)", value: -3 },
  { label: "GND (-4)", value: -4 },
  { label: "GND (-6)", value: -6 },
];

// ── Helpers ──

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mt-2">
      {children}
    </h3>
  );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-neutral-400 w-20 shrink-0">{label}</Label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function PinSelect({
  value,
  onChange,
  includeNone,
  includeGroundPins,
}: {
  value: number | null;
  onChange: (pin: number | null) => void;
  includeNone?: boolean;
  includeGroundPins?: boolean;
}) {
  const options = includeGroundPins ? [...ALL_PINS, ...GROUND_PIN_OPTIONS] : ALL_PINS;
  return (
    <select
      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-neutral-200 outline-none focus:border-zinc-500"
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? null : parseInt(v, 10));
      }}
    >
      {(includeNone !== false) && <option value="">None</option>}
      {options.map((p) => (
        <option key={p.value} value={p.value}>{p.label}</option>
      ))}
    </select>
  );
}

// ── Component Warnings ──

function ComponentWarnings({ componentId }: { componentId: string }) {
  const { analysis } = useCircuitAnalysis();
  const electrical = useElectricalReport();

  const warnings = useMemo(() => {
    const msgs: Array<{ severity: "error" | "warning"; message: string }> = [];

    // Circuit analysis warnings (no resistor, reverse polarity, open circuit, etc.)
    if (analysis?.warnings) {
      for (const w of analysis.warnings) {
        if (w.componentId === componentId) {
          msgs.push({ severity: "warning", message: w.message });
        }
      }
    }

    // Power budget issues (external power required, overcurrent, etc.)
    for (const issue of electrical.issues) {
      if (issue.componentId === componentId) {
        msgs.push({ severity: issue.severity, message: issue.message });
      }
    }

    return msgs;
  }, [componentId, analysis, electrical]);

  if (warnings.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 mt-1">
      <SectionTitle>Warnings</SectionTitle>
      {warnings.map((w, i) => (
        <div
          key={i}
          className={`rounded px-2 py-1.5 text-[11px] leading-snug ${
            w.severity === "error"
              ? "bg-red-900/30 text-red-300 border border-red-800/50"
              : "bg-amber-900/30 text-amber-300 border border-amber-800/50"
          }`}
        >
          {w.message}
        </div>
      ))}
    </div>
  );
}

// ── Wire Inspector ──

function WireInspector({ wire, onUpdate }: {
  wire: Wire;
  onUpdate: (changes: Partial<Wire>) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>Jumper Wire</SectionTitle>
      <Separator />
      <PropertyRow label="Color">
        <div className="flex gap-1 flex-wrap">
          {WIRE_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`w-6 h-6 rounded-md border-2 transition-all ${
                wire.color === c.value ? "border-white scale-110" : "border-zinc-600"
              }`}
              style={{ backgroundColor: c.value }}
              title={c.label}
              onClick={() => onUpdate({ color: c.value })}
            />
          ))}
        </div>
      </PropertyRow>
      <PropertyRow label="From">
        <span className="text-xs text-neutral-300">
          {wire.fromRow === -999
            ? `Arduino Pin ${wire.fromCol}`
            : `Row ${wire.fromRow + 1}, Col ${wire.fromCol}`}
        </span>
      </PropertyRow>
      <PropertyRow label="To">
        <span className="text-xs text-neutral-300">
          Row {wire.toRow + 1}, Col {wire.toCol}
        </span>
      </PropertyRow>
    </div>
  );
}

// ── Component-specific inspectors ──

function LedInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const color = (component.properties.color as string) ?? "#ef4444";
  return (
    <>
      <PropertyRow label="Color">
        <div className="flex gap-1 flex-wrap">
          {LED_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`w-6 h-6 rounded-full border-2 transition-all ${
                color === c.value ? "border-white scale-110" : "border-zinc-600"
              }`}
              style={{ backgroundColor: c.value }}
              title={c.label}
              onClick={() => onUpdate({ properties: { ...component.properties, color: c.value } })}
            />
          ))}
        </div>
      </PropertyRow>
      <PropertyRow label="Anode">
        <PinSelect
          value={component.pins.anode ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, anode: pin } })}
        />
      </PropertyRow>
      <PropertyRow label="Cathode">
        <PinSelect
          value={component.pins.cathode ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, cathode: pin } })}
        />
      </PropertyRow>
    </>
  );
}

function ResistorInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const resistance = (component.properties.resistance as number) ?? 220;
  return (
    <>
      <PropertyRow label="Resistance">
        <select
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-neutral-200 outline-none focus:border-zinc-500"
          value={resistance}
          onChange={(e) => onUpdate({
            properties: { ...component.properties, resistance: parseInt(e.target.value, 10) },
          })}
        >
          {RESISTOR_VALUES.map((r) => (
            <option key={r} value={r}>
              {r >= 1000 ? `${r / 1000}kΩ` : `${r}Ω`}
            </option>
          ))}
        </select>
      </PropertyRow>
      <PropertyRow label="Custom (Ω)">
        <Input
          className="h-auto px-2 py-1 text-xs"
          type="number"
          min={1}
          value={resistance}
          onChange={(e) => {
            const v = parseInt((e.target as HTMLInputElement).value, 10);
            if (v > 0) onUpdate({ properties: { ...component.properties, resistance: v } });
          }}
        />
      </PropertyRow>
    </>
  );
}

function ButtonInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const { state: boardState } = useBoard();
  const wiring = useMemo(
    () => analyzeButtonWiring(component, boardState.wires),
    [component, boardState.wires],
  );
  const inputPin = wiring.inputPin;
  const pinState = usePinState(inputPin ?? -1);
  // INPUT_PULLUP: pressed = pin LOW. INPUT: pressed = HIGH.
  const isPullup = pinState?.mode === "INPUT_PULLUP";
  const pressedValue: 0 | 1 = isPullup ? 0 : 1;
  const releasedValue: 0 | 1 = isPullup ? 1 : 0;
  const canDrivePress =
    inputPin != null &&
    !wiring.hasSignalOnBothSides &&
    ((isPullup && wiring.hasGroundReference) || (!isPullup && pinState?.mode === "INPUT" && wiring.hasPowerReference));
  const physicallyPressed = useButtonPressed(component.id);
  const isPressed = physicallyPressed;

  const handlePress = useCallback(() => {
    buttonPressStore.press(component.id);
    if (canDrivePress && inputPin != null) {
      pinStateStore.writeExternal(inputPin, { digitalValue: pressedValue });
    }
  }, [canDrivePress, component.id, inputPin, pressedValue]);

  const handleRelease = useCallback(() => {
    buttonPressStore.release(component.id);
    if (inputPin != null) {
      pinStateStore.writeExternal(inputPin, { digitalValue: releasedValue });
    }
  }, [component.id, inputPin, releasedValue]);

  return (
    <>
      <PropertyRow label="Pin A">
        <PinSelect
          value={component.pins.a ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, a: pin } })}
        />
      </PropertyRow>
      <PropertyRow label="Pin B">
        <PinSelect
          value={component.pins.b ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, b: pin } })}
        />
      </PropertyRow>
      <PropertyRow label="Press">
        <button
          type="button"
          onPointerDown={handlePress}
          onPointerUp={handleRelease}
          onPointerLeave={handleRelease}
          className={`w-full px-3 py-1.5 rounded-md text-xs font-medium transition-colors select-none ${
            isPressed
              ? "bg-blue-600 text-white"
              : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600 active:bg-blue-600 active:text-white"
          }`}
        >
          {isPressed ? "Pressed" : "Hold to press"}
        </button>
      </PropertyRow>
      {!canDrivePress && (
        <div className="rounded px-2 py-1.5 text-[11px] leading-snug bg-amber-900/30 text-amber-300 border border-amber-800/50">
          Button press is in strict mode: wire one side to an Arduino input pin and the opposite side to
          {isPullup ? " GND" : " 5V/3V3"}.
        </div>
      )}
    </>
  );
}

function ServoInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const angle = (component.properties.angle as number) ?? 90;
  return (
    <>
      <PropertyRow label="Signal Pin">
        <PinSelect
          value={component.pins.signal ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, signal: pin } })}
        />
      </PropertyRow>
      <PropertyRow label="Angle">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={180}
            value={angle}
            className="flex-1"
            onChange={(e) => onUpdate({
              properties: { ...component.properties, angle: parseInt(e.target.value, 10) },
            })}
          />
          <span className="text-xs text-neutral-300 w-8 text-right">{angle}°</span>
        </div>
      </PropertyRow>
    </>
  );
}

function BuzzerInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  return (
    <>
      <PropertyRow label="+ Pin">
        <PinSelect
          value={component.pins.positive ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, positive: pin } })}
        />
      </PropertyRow>
      <PropertyRow label="- Pin">
        <PinSelect
          value={component.pins.negative ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, negative: pin } })}
        />
      </PropertyRow>
    </>
  );
}

function CapacitorInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const capacitance = (component.properties.capacitance as number) ?? 100;
  return (
    <>
      <PropertyRow label="Value (µF)">
        <Input
          className="h-auto px-2 py-1 text-xs"
          type="number"
          min={0.1}
          step={0.1}
          value={capacitance}
          onChange={(e) => {
            const v = parseFloat((e.target as HTMLInputElement).value);
            if (v > 0) onUpdate({ properties: { ...component.properties, capacitance: v } });
          }}
        />
      </PropertyRow>
    </>
  );
}

function PowerSupplyInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const leftVoltage = (component.properties.leftVoltage as number) ?? 5;
  const rightVoltage = (component.properties.rightVoltage as number) ?? 3.3;

  const VoltagePicker = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
  }) => (
    <PropertyRow label={label}>
      <div className="flex gap-1">
        {[5, 3.3].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
              value === v
                ? "bg-emerald-600 text-white"
                : "bg-zinc-800 text-neutral-300 hover:bg-zinc-700"
            }`}
          >
            {v}V
          </button>
        ))}
      </div>
    </PropertyRow>
  );

  return (
    <>
      <VoltagePicker
        label="Left Rail"
        value={leftVoltage}
        onChange={(v) =>
          onUpdate({
            properties: { ...component.properties, leftVoltage: v },
          })
        }
      />
      <VoltagePicker
        label="Right Rail"
        value={rightVoltage}
        onChange={(v) =>
          onUpdate({
            properties: { ...component.properties, rightVoltage: v },
          })
        }
      />
      <p className="text-[10px] text-neutral-500 leading-snug mt-1">
        Each side feeds the adjacent + and − power rails on the breadboard.
        No wiring required — drop the module on and the rails are live.
      </p>
    </>
  );
}

function MultimeterInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const mode = (component.properties.mode as string | undefined) ?? "volts";
  const modes: Array<{ key: "volts" | "amps" | "ohms"; label: string; hint: string }> = [
    { key: "volts", label: "DC V", hint: "Voltage drop between probes (high-Z)" },
    { key: "amps", label: "DC A", hint: "Series current (near-short — put in the current path)" },
    { key: "ohms", label: "Ω", hint: "Resistance between probes (reads component value)" },
  ];
  const activeHint = modes.find((m) => m.key === mode)?.hint ?? "";
  return (
    <>
      <PropertyRow label="Mode">
        <div className="flex gap-1">
          {modes.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() =>
                onUpdate({
                  properties: { ...component.properties, mode: m.key },
                })
              }
              className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                mode === m.key
                  ? "bg-amber-600 text-white"
                  : "bg-zinc-800 text-neutral-300 hover:bg-zinc-700"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </PropertyRow>
      <p className="text-[10px] text-neutral-500 leading-snug mt-1">
        {activeHint}
      </p>
    </>
  );
}

function PotentiometerInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const value = (component.properties.value as number) ?? 50;
  return (
    <>
      <PropertyRow label="Position">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={value}
            className="flex-1"
            onChange={(e) => onUpdate({
              properties: { ...component.properties, value: parseInt(e.target.value, 10) },
            })}
          />
          <span className="text-xs text-neutral-300 w-8 text-right">{value}%</span>
        </div>
      </PropertyRow>
      <PropertyRow label="Signal">
        <PinSelect
          value={component.pins.signal ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, signal: pin } })}
        />
      </PropertyRow>
    </>
  );
}

function RgbLedInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  return (
    <>
      <PropertyRow label="Red Pin">
        <PinSelect value={component.pins.red ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, red: pin } })} />
      </PropertyRow>
      <PropertyRow label="Green Pin">
        <PinSelect value={component.pins.green ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, green: pin } })} />
      </PropertyRow>
      <PropertyRow label="Blue Pin">
        <PinSelect value={component.pins.blue ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, blue: pin } })} />
      </PropertyRow>
      <PropertyRow label="Cathode">
        <PinSelect value={component.pins.cathode ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, cathode: pin } })} />
      </PropertyRow>
    </>
  );
}

function TemperatureSensorInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const temp = (component.properties.temperature as number) ?? 25;
  return (
    <>
      <PropertyRow label="Temperature">
        <div className="flex items-center gap-2">
          <input type="range" min={-40} max={125} value={temp} className="flex-1"
            onChange={(e) => onUpdate({
              properties: { ...component.properties, temperature: parseInt(e.target.value, 10) },
            })} />
          <span className="text-xs text-neutral-300 w-10 text-right">{temp}°C</span>
        </div>
      </PropertyRow>
      <PropertyRow label="Signal">
        <PinSelect value={component.pins.signal ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, signal: pin } })} />
      </PropertyRow>
    </>
  );
}

function PhotoresistorInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const light = (component.properties.light as number) ?? 50;
  return (
    <>
      <PropertyRow label="Light Level">
        <div className="flex items-center gap-2">
          <input type="range" min={0} max={100} value={light} className="flex-1"
            onChange={(e) => onUpdate({
              properties: { ...component.properties, light: parseInt(e.target.value, 10) },
            })} />
          <span className="text-xs text-neutral-300 w-10 text-right">{light}%</span>
        </div>
      </PropertyRow>
      <PropertyRow label="Pin A">
        <PinSelect value={component.pins.a ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, a: pin } })} />
      </PropertyRow>
      <PropertyRow label="Pin B">
        <PinSelect value={component.pins.b ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, b: pin } })} />
      </PropertyRow>
    </>
  );
}

function UltrasonicInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const { state: boardState, send: boardSend } = useBoard();
  const env = boardState.environment;
  const hasObstacles = Object.keys(env.obstacles).length > 0 || env.boundaryEnabled;
  const distance = (component.properties.distance as number) ?? 50;

  return (
    <>
      {/* Manual distance slider — shown as fallback when no environment */}
      <PropertyRow label="Distance">
        <div className="flex items-center gap-2">
          <input type="range" min={2} max={400} value={distance} className="flex-1"
            disabled={hasObstacles}
            onChange={(e) => onUpdate({
              properties: { ...component.properties, distance: parseInt(e.target.value, 10) },
            })} />
          <span className="text-xs text-neutral-300 w-12 text-right">
            {hasObstacles ? "auto" : `${distance} cm`}
          </span>
        </div>
      </PropertyRow>
      {hasObstacles && (
        <PropertyRow label="Mode">
          <span className="text-xs text-cyan-400">Ray-cast (environment)</span>
        </PropertyRow>
      )}
      <PropertyRow label="Trigger">
        <PinSelect value={component.pins.trigger ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, trigger: pin } })} />
      </PropertyRow>
      <PropertyRow label="Echo">
        <PinSelect value={component.pins.echo ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, echo: pin } })} />
      </PropertyRow>

      <Separator />

      {/* Environment controls */}
      <PropertyRow label="Boundary">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={env.boundaryEnabled}
            onChange={(e) => boardSend({
              type: "UPDATE_ENVIRONMENT",
              changes: { boundaryEnabled: e.target.checked },
            })} />
          <span className="text-xs text-neutral-300">Room walls</span>
        </label>
      </PropertyRow>
      <PropertyRow label="Obstacles">
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400">{Object.keys(env.obstacles).length} placed</span>
          <button
            className="px-1.5 py-0.5 text-xs rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
            onClick={() => {
              const id = `obs_${Date.now()}`
              boardSend({
                type: "ADD_OBSTACLE",
                obstacle: {
                  id,
                  shape: "box",
                  x1: 200, y1: 100,
                  x2: 260, y2: 140,
                  label: "",
                },
              })
            }}
          >
            + Box
          </button>
          <button
            className="px-1.5 py-0.5 text-xs rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
            onClick={() => {
              const id = `obs_${Date.now()}`
              boardSend({
                type: "ADD_OBSTACLE",
                obstacle: {
                  id,
                  shape: "wall",
                  x1: 200, y1: 100,
                  x2: 300, y2: 100,
                  label: "",
                },
              })
            }}
          >
            + Wall
          </button>
        </div>
      </PropertyRow>

      {/* List placed obstacles with remove buttons */}
      {Object.values(env.obstacles).map((obs) => (
        <PropertyRow key={obs.id} label={obs.shape === "wall" ? "Wall" : "Box"}>
          <div className="flex items-center gap-1">
            <span className="text-xs text-neutral-400">
              ({Math.round(obs.x1)},{Math.round(obs.y1)})
            </span>
            <button
              className="px-1 text-xs text-red-400 hover:text-red-300"
              onClick={() => boardSend({ type: "REMOVE_OBSTACLE", id: obs.id })}
            >
              x
            </button>
          </div>
        </PropertyRow>
      ))}
    </>
  );
}

function LcdInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  return (
    <>
      {["rs", "en", "d4", "d5", "d6", "d7"].map((pin) => (
        <PropertyRow key={pin} label={pin.toUpperCase()}>
          <PinSelect value={component.pins[pin] ?? null}
            onChange={(v) => onUpdate({ pins: { ...component.pins, [pin]: v } })} />
        </PropertyRow>
      ))}
    </>
  );
}

function SevenSegmentInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  return (
    <>
      {["a", "b", "c", "d", "e", "f", "g", "dp"].map((seg) => (
        <PropertyRow key={seg} label={`Seg ${seg.toUpperCase()}`}>
          <PinSelect value={component.pins[seg] ?? null}
            onChange={(v) => onUpdate({ pins: { ...component.pins, [seg]: v } })} />
        </PropertyRow>
      ))}
      <PropertyRow label="Ground">
        <PinSelect
          value={component.pins.gnd ?? null}
          includeGroundPins
          onChange={(v) => onUpdate({ pins: { ...component.pins, gnd: v } })}
        />
      </PropertyRow>
    </>
  );
}

function PirSensorInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const motion = (component.properties.motion as boolean) === true;
  return (
    <>
      <PropertyRow label="Motion">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={motion}
            onChange={(e) =>
              onUpdate({
                properties: { ...component.properties, motion: e.target.checked },
              })
            }
            className="accent-amber-500"
          />
          <span className={`text-xs ${motion ? "text-amber-400" : "text-neutral-400"}`}>
            {motion ? "Detected" : "Idle"}
          </span>
        </label>
      </PropertyRow>
      <PropertyRow label="Signal">
        <PinSelect
          value={component.pins.signal ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, signal: pin } })}
        />
      </PropertyRow>
    </>
  );
}

function DhtSensorInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const variant = (component.properties.variant as string) ?? "DHT11";
  const temperature = (component.properties.temperature as number) ?? 25;
  const humidity = (component.properties.humidity as number) ?? 50;
  const tempMin = variant === "DHT22" ? -40 : 0;
  const tempMax = variant === "DHT22" ? 80 : 50;
  return (
    <>
      <PropertyRow label="Variant">
        <select
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-neutral-200 outline-none focus:border-zinc-500"
          value={variant}
          onChange={(e) =>
            onUpdate({
              properties: { ...component.properties, variant: e.target.value },
            })
          }
        >
          <option value="DHT11">DHT11</option>
          <option value="DHT22">DHT22</option>
        </select>
      </PropertyRow>
      <PropertyRow label="Temperature">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={tempMin}
            max={tempMax}
            value={temperature}
            className="flex-1"
            onChange={(e) =>
              onUpdate({
                properties: {
                  ...component.properties,
                  temperature: parseInt(e.target.value, 10),
                },
              })
            }
          />
          <span className="text-xs text-neutral-300 w-10 text-right">{temperature}°C</span>
        </div>
      </PropertyRow>
      <PropertyRow label="Humidity">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={humidity}
            className="flex-1"
            onChange={(e) =>
              onUpdate({
                properties: {
                  ...component.properties,
                  humidity: parseInt(e.target.value, 10),
                },
              })
            }
          />
          <span className="text-xs text-neutral-300 w-10 text-right">{humidity}%</span>
        </div>
      </PropertyRow>
      <PropertyRow label="Signal">
        <PinSelect
          value={component.pins.signal ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, signal: pin } })}
        />
      </PropertyRow>
    </>
  );
}

function IrReceiverInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const pendingCode = (component.properties.codeDraft as string) ?? "FF00FF";
  const lastSentAt = (component.properties.pendingCodeAt as number) ?? 0;
  const recent = Date.now() - lastSentAt < 400;
  return (
    <>
      <PropertyRow label="Hex code">
        <Input
          className="h-auto px-2 py-1 text-xs font-mono"
          value={pendingCode}
          placeholder="FF00FF"
          onChange={(e) =>
            onUpdate({
              properties: {
                ...component.properties,
                codeDraft: (e.target as HTMLInputElement).value,
              },
            })
          }
        />
      </PropertyRow>
      <PropertyRow label="Send">
        <button
          type="button"
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            recent
              ? "bg-amber-500 text-zinc-900"
              : "bg-zinc-700 hover:bg-zinc-600 text-neutral-200"
          }`}
          onClick={() =>
            onUpdate({
              properties: {
                ...component.properties,
                pendingCode,
                pendingCodeAt: Date.now(),
              },
            })
          }
        >
          {recent ? "Sent" : "Send code"}
        </button>
      </PropertyRow>
      <PropertyRow label="Signal">
        <PinSelect
          value={component.pins.signal ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, signal: pin } })}
        />
      </PropertyRow>
    </>
  );
}

function GenericPinInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const pinEntries = Object.entries(component.pins);
  if (pinEntries.length === 0) return null;
  return (
    <>
      {pinEntries.map(([name, value]) => (
        <PropertyRow key={name} label={name}>
          <PinSelect
            value={value}
            onChange={(pin) => onUpdate({ pins: { ...component.pins, [name]: pin } })}
          />
        </PropertyRow>
      ))}
    </>
  );
}

// ── Component type labels ──
const TYPE_LABELS: Record<string, string> = {
  led: "LED",
  rgb_led: "RGB LED",
  button: "Push Button",
  resistor: "Resistor",
  capacitor: "Capacitor",
  ic: "IC Chip",
  potentiometer: "Potentiometer",
  buzzer: "Buzzer",
  servo: "Servo Motor",
  lcd_16x2: "LCD 16×2",
  seven_segment: "7-Segment Display",
  photoresistor: "Photoresistor",
  temperature_sensor: "Temperature Sensor",
  ultrasonic_sensor: "Ultrasonic Sensor",
  neopixel: "NeoPixel Strip",
  pir_sensor: "PIR Sensor",
  relay: "Relay",
  dc_motor: "DC Motor",
  dht_sensor: "DHT Sensor",
  ir_receiver: "IR Receiver",
  shift_register: "Shift Register",
  oled_display: "OLED Display",
};

const DOCS_PATHS: Record<string, string> = {
  led: "/documentation/components/led",
  rgb_led: "/documentation/components/rgb-led",
  button: "/documentation/components/button",
  resistor: "/documentation/components/resistor",
  capacitor: "/documentation/components/capacitor",
  potentiometer: "/documentation/components/potentiometer",
  buzzer: "/documentation/components/buzzer",
  servo: "/documentation/components/servo",
  lcd_16x2: "/documentation/components/lcd-16x2",
  seven_segment: "/documentation/components/seven-segment",
  photoresistor: "/documentation/components/photoresistor",
  temperature_sensor: "/documentation/components/temperature-sensor",
  ultrasonic_sensor: "/documentation/components/ultrasonic-sensor",
  neopixel: "/documentation/components/neopixel",
  pir_sensor: "/documentation/components/pir-sensor",
  relay: "/documentation/components/relay",
  dc_motor: "/documentation/components/dc-motor",
  dht_sensor: "/documentation/components/dht-sensor",
  ir_receiver: "/documentation/components/ir-receiver",
  shift_register: "/documentation/components/shift-register",
  oled_display: "/documentation/components/oled-display",
};

// ── Main Component Inspector ──

function ComponentInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const typeLabel = TYPE_LABELS[component.type] ?? component.type;
  const docsPath = DOCS_PATHS[component.type];

  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>{typeLabel}</SectionTitle>
      <Separator />

      <PropertyRow label="Name">
        <Input
          className="h-auto px-2 py-1 text-xs"
          value={component.name}
          onChange={(e) => onUpdate({ name: (e.target as HTMLInputElement).value })}
        />
      </PropertyRow>

      <PropertyRow label="Position">
        <span className="text-xs text-neutral-300">
          Row {component.y + 1}, Col {component.x}
        </span>
      </PropertyRow>

      {docsPath && (
        <a
          href={docsPath}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 transition-colors"
        >
          <svg viewBox="0 0 16 16" width={12} height={12} className="shrink-0">
            <path d="M2 2h8l4 4v8H2V2z" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
            <line x1={10} y1={2} x2={10} y2={6} stroke="currentColor" strokeWidth={1.5} />
            <line x1={10} y1={6} x2={14} y2={6} stroke="currentColor" strokeWidth={1.5} />
          </svg>
          View documentation
        </a>
      )}

      <Separator />

      {/* Type-specific inspectors */}
      {component.type === "led" && <LedInspector component={component} onUpdate={onUpdate} />}
      {component.type === "rgb_led" && <RgbLedInspector component={component} onUpdate={onUpdate} />}
      {component.type === "resistor" && <ResistorInspector component={component} onUpdate={onUpdate} />}
      {component.type === "button" && <ButtonInspector component={component} onUpdate={onUpdate} />}
      {component.type === "servo" && <ServoInspector component={component} onUpdate={onUpdate} />}
      {component.type === "buzzer" && <BuzzerInspector component={component} onUpdate={onUpdate} />}
      {component.type === "capacitor" && <CapacitorInspector component={component} onUpdate={onUpdate} />}
      {component.type === "potentiometer" && <PotentiometerInspector component={component} onUpdate={onUpdate} />}
      {component.type === "temperature_sensor" && <TemperatureSensorInspector component={component} onUpdate={onUpdate} />}
      {component.type === "photoresistor" && <PhotoresistorInspector component={component} onUpdate={onUpdate} />}
      {component.type === "ultrasonic_sensor" && <UltrasonicInspector component={component} onUpdate={onUpdate} />}
      {component.type === "lcd_16x2" && <LcdInspector component={component} onUpdate={onUpdate} />}
      {component.type === "seven_segment" && <SevenSegmentInspector component={component} onUpdate={onUpdate} />}
      {component.type === "pir_sensor" && <PirSensorInspector component={component} onUpdate={onUpdate} />}
      {component.type === "dht_sensor" && <DhtSensorInspector component={component} onUpdate={onUpdate} />}
      {component.type === "ir_receiver" && <IrReceiverInspector component={component} onUpdate={onUpdate} />}
      {component.type === "power_supply" && <PowerSupplyInspector component={component} onUpdate={onUpdate} />}
      {component.type === "multimeter" && <MultimeterInspector component={component} onUpdate={onUpdate} />}

      {/* Generic pin inspector for any remaining types */}
      {!["led", "rgb_led", "resistor", "button", "servo", "buzzer", "capacitor", "potentiometer", "temperature_sensor", "photoresistor", "ultrasonic_sensor", "lcd_16x2", "seven_segment", "pir_sensor", "dht_sensor", "ir_receiver", "power_supply", "multimeter"].includes(component.type) && (
        <GenericPinInspector component={component} onUpdate={onUpdate} />
      )}
    </div>
  );
}

// ── Main Inspector ──

export default function Inspector() {
  const { state: boardState, send: boardSend } = useBoard();
  const { state: graphState } = useGraph();

  // Graph node/edge selected → show graph inspector
  const hasGraphSelection =
    graphState.selectedNodeIds.size > 0 ||
    graphState.selectedEdgeIds.size > 0;

  if (hasGraphSelection) {
    return (
      <div className="h-full bg-card flex flex-col overflow-hidden overflow-y-auto">
        <GraphInspector />
      </div>
    );
  }

  // Find selected board item (component or wire)
  const selectedComponent = boardState.selectedId
    ? boardState.components[boardState.selectedId] ?? null
    : null;
  const selectedWire = boardState.selectedId
    ? boardState.wires[boardState.selectedId] ?? null
    : null;

  const handleComponentUpdate = useCallback(
    (changes: Partial<BoardComponent>) => {
      if (!boardState.selectedId) return;
      boardSend({ type: "UPDATE_COMPONENT", id: boardState.selectedId, changes });
    },
    [boardState.selectedId, boardSend],
  );

  const handleWireUpdate = useCallback(
    (changes: Partial<Wire>) => {
      if (!boardState.selectedId || !selectedWire) return;
      // Remove old wire and add updated one
      boardSend({ type: "REMOVE_WIRE", id: boardState.selectedId });
      boardSend({
        type: "ADD_WIRE",
        wire: { ...selectedWire, ...changes },
      });
      boardSend({ type: "SELECT", id: selectedWire.id });
    },
    [boardState.selectedId, selectedWire, boardSend],
  );

  const handleDelete = useCallback(() => {
    if (!boardState.selectedId) return;
    if (selectedWire) {
      boardSend({ type: "REMOVE_WIRE", id: boardState.selectedId });
    } else if (selectedComponent) {
      boardSend({ type: "REMOVE_COMPONENT", id: boardState.selectedId });
    }
    boardSend({ type: "SELECT", id: null });
  }, [boardState.selectedId, selectedWire, selectedComponent, boardSend]);

  return (
    <div className="h-full bg-card flex flex-col overflow-hidden overflow-y-auto">
      {!selectedComponent && !selectedWire ? (
        <div className="px-3 py-4 text-xs text-muted-foreground">
          Select a component or wire to inspect
        </div>
      ) : (
        <div className="p-3 flex flex-col gap-2">
          {selectedComponent && (
            <>
              <ComponentInspector
                component={selectedComponent}
                onUpdate={handleComponentUpdate}
              />
              <ComponentWarnings componentId={selectedComponent.id} />
            </>
          )}
          {selectedWire && (
            <WireInspector
              wire={selectedWire}
              onUpdate={handleWireUpdate}
            />
          )}

          <Separator />

          {/* Delete button */}
          <button
            type="button"
            onClick={handleDelete}
            className="w-full mt-1 px-3 py-1.5 rounded-md bg-red-900/40 text-red-400 text-xs font-medium hover:bg-red-900/60 active:bg-red-900/80 transition-colors"
          >
            Delete {selectedWire ? "Wire" : "Component"}
          </button>
        </div>
      )}
    </div>
  );
}
