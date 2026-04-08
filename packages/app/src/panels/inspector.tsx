import { useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { useBoard } from "@/store/board-context";
import { useGraph } from "../store/graph-context";
import { GraphInspector } from "./graph-inspector";
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
}: {
  value: number | null;
  onChange: (pin: number | null) => void;
  includeNone?: boolean;
}) {
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
      {ALL_PINS.map((p) => (
        <option key={p.value} value={p.value}>{p.label}</option>
      ))}
    </select>
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
  const distance = (component.properties.distance as number) ?? 50;
  return (
    <>
      <PropertyRow label="Distance">
        <div className="flex items-center gap-2">
          <input type="range" min={2} max={400} value={distance} className="flex-1"
            onChange={(e) => onUpdate({
              properties: { ...component.properties, distance: parseInt(e.target.value, 10) },
            })} />
          <span className="text-xs text-neutral-300 w-12 text-right">{distance} cm</span>
        </div>
      </PropertyRow>
      <PropertyRow label="Trigger">
        <PinSelect value={component.pins.trigger ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, trigger: pin } })} />
      </PropertyRow>
      <PropertyRow label="Echo">
        <PinSelect value={component.pins.echo ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, echo: pin } })} />
      </PropertyRow>
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
      {["a", "b", "c", "d", "e", "f", "g"].map((seg) => (
        <PropertyRow key={seg} label={`Seg ${seg.toUpperCase()}`}>
          <PinSelect value={component.pins[seg] ?? null}
            onChange={(v) => onUpdate({ pins: { ...component.pins, [seg]: v } })} />
        </PropertyRow>
      ))}
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
};

// ── Main Component Inspector ──

function ComponentInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const typeLabel = TYPE_LABELS[component.type] ?? component.type;

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

      {/* Generic pin inspector for any remaining types */}
      {!["led", "rgb_led", "resistor", "button", "servo", "buzzer", "capacitor", "potentiometer", "temperature_sensor", "photoresistor", "ultrasonic_sensor", "lcd_16x2", "seven_segment"].includes(component.type) && (
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
            <ComponentInspector
              component={selectedComponent}
              onUpdate={handleComponentUpdate}
            />
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
