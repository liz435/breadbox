import { useMemo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Slider } from "@base-ui/react/slider";
import { Collapsible } from "@base-ui/react/collapsible";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useBoard } from "@/store/board-context";
import { useGraph } from "../store/graph-context";
import { GraphInspector } from "./graph-inspector";
import { pinStateStore } from "@/simulator/pin-state-store";
import { buttonPressStore, useButtonPressed } from "@/simulator/button-press-store";
import { usePinState } from "@/simulator/use-pin-state";
import { analyzeButtonWiring, findArduinoPinForComponentPin } from "@/breadboard/component-pin-resolver";
import { useCircuitAnalysis } from "@/simulator/circuit-analysis-hook";
import { useElectricalReport } from "@/electrical/power-budget";
import {
  sensorRay,
  raycastDistance,
  environmentToSegments,
  pixelsToCm,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from "@/simulator/ray-cast";
import type { BoardComponent, LibraryState, Wire } from "@dreamer/schemas";

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

const RESISTOR_VALUES = [100, 220, 330, 470, 1000, 2200, 4700, 10000, 47000, 100000];

const LED_COLORS = [
  { label: "Red", value: "#ef4444" },
  { label: "Green", value: "#22c55e" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Yellow", value: "#eab308" },
  { label: "White", value: "#f8fafc" },
  { label: "Orange", value: "#f97316" },
];

const DIGITAL_PINS = Array.from({ length: 14 }, (_, i) => ({ label: `D${i}`, value: i }));
const ANALOG_PINS = Array.from({ length: 6 }, (_, i) => ({ label: `A${i}`, value: 14 + i }));
const ALL_PINS = [...DIGITAL_PINS, ...ANALOG_PINS];
const GROUND_PIN_OPTIONS = [
  { label: "GND (-3)", value: -3 },
  { label: "GND (-4)", value: -4 },
  { label: "GND (-6)", value: -6 },
];

const selectClass =
  "h-7 w-full rounded-md border border-border bg-input px-2 text-xs text-foreground outline-none transition-colors hover:border-ring focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring";

const inputClass = "h-7 px-2 py-0 text-xs shadow-none";

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </div>
  );
}

function PropertyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 truncate text-[11px] text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible.Root defaultOpen={defaultOpen} className="flex flex-col">
      <Collapsible.Trigger className="group flex h-6 w-full items-center gap-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground">
        <svg
          viewBox="0 0 12 12"
          width={10}
          height={10}
          className="shrink-0 transition-transform group-data-[panel-open]:rotate-90"
          aria-hidden
        >
          <path d="M4 3l4 3-4 3" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{title}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="overflow-hidden transition-[height] duration-200 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0">
        <div className="flex flex-col gap-2 pt-2">{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function SliderField({
  value,
  min,
  max,
  step = 1,
  valueLabel,
  onChange,
  onCommit,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  valueLabel: string;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <Slider.Root
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => {
          if (typeof v === "number") onChange(v);
        }}
        onValueCommitted={(v) => {
          if (typeof v === "number") onCommit?.(v);
        }}
        className="flex h-7 min-w-0 flex-1 items-center"
      >
        <Slider.Control className="group flex h-7 w-full touch-none items-center py-2 select-none">
          <Slider.Track className="relative h-1 w-full rounded-full bg-muted">
            <Slider.Indicator className="absolute inset-y-0 left-0 rounded-full bg-foreground/70 transition-colors group-hover:bg-foreground group-data-[dragging]:bg-foreground" />
            <Slider.Thumb className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-foreground shadow-sm outline-none transition-[transform,box-shadow] hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring/60 data-[dragging]:scale-110 data-[dragging]:shadow-md" />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
      <span className="shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground/90" style={{ minWidth: "3.5ch" }}>
        {valueLabel}
      </span>
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
      className={selectClass}
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

function SwatchButton({
  color,
  label,
  selected,
  shape = "square",
  onClick,
}: {
  color: string;
  label: string;
  selected: boolean;
  shape?: "square" | "round";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onClick={onClick}
      className={cn(
        "size-6 border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        shape === "round" ? "rounded-full" : "rounded-md",
        selected
          ? "border-foreground ring-2 ring-ring/40"
          : "border-border hover:border-muted-foreground",
      )}
      style={{ backgroundColor: color }}
    />
  );
}

function ComponentWarnings({ componentId }: { componentId: string }) {
  const { analysis } = useCircuitAnalysis();
  const electrical = useElectricalReport();

  const warnings = useMemo(() => {
    const msgs: Array<{ severity: "error" | "warning"; message: string }> = [];
    if (analysis?.warnings) {
      for (const w of analysis.warnings) {
        if (w.componentId === componentId) {
          msgs.push({ severity: "warning", message: w.message });
        }
      }
    }
    for (const issue of electrical.issues) {
      if (issue.componentId === componentId) {
        msgs.push({ severity: issue.severity, message: issue.message });
      }
    }
    return msgs;
  }, [componentId, analysis, electrical]);

  if (warnings.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Warnings</SectionLabel>
      {warnings.map((w, i) => (
        <div
          key={i}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-[11px] leading-snug",
            w.severity === "error"
              ? "bg-destructive/15 text-destructive border border-destructive/30"
              : "bg-amber-500/10 text-amber-400 border border-amber-500/25",
          )}
        >
          {w.message}
        </div>
      ))}
    </div>
  );
}

function WireInspector({ wire, onUpdate }: {
  wire: Wire;
  onUpdate: (changes: Partial<Wire>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Jumper Wire
        </div>
        <div className="mt-0.5 text-sm font-medium text-foreground">
          {WIRE_COLORS.find((c) => c.value === wire.color)?.label ?? "Custom"} wire
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>Color</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {WIRE_COLORS.map((c) => (
            <SwatchButton
              key={c.value}
              color={c.value}
              label={c.label}
              selected={wire.color === c.value}
              onClick={() => onUpdate({ color: c.value })}
            />
          ))}
        </div>
      </div>

      <CollapsibleSection title="Endpoints">
        <PropertyRow label="From">
          <span className="text-xs text-foreground/90">
            {wire.fromRow === -999
              ? `Arduino Pin ${wire.fromCol}`
              : `Row ${wire.fromRow + 1}, Col ${wire.fromCol}`}
          </span>
        </PropertyRow>
        <PropertyRow label="To">
          <span className="text-xs text-foreground/90">
            Row {wire.toRow + 1}, Col {wire.toCol}
          </span>
        </PropertyRow>
      </CollapsibleSection>
    </div>
  );
}

function LedInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const color = (component.properties.color as string) ?? "#ef4444";
  return (
    <>
      <div className="flex flex-col gap-2">
        <SectionLabel>Color</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {LED_COLORS.map((c) => (
            <SwatchButton
              key={c.value}
              color={c.value}
              label={c.label}
              selected={color === c.value}
              shape="round"
              onClick={() => onUpdate({ properties: { ...component.properties, color: c.value } })}
            />
          ))}
        </div>
      </div>

      <CollapsibleSection title="Pins" defaultOpen>
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
      </CollapsibleSection>
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
          className={selectClass}
          value={RESISTOR_VALUES.includes(resistance) ? resistance : ""}
          onChange={(e) => onUpdate({
            properties: { ...component.properties, resistance: parseInt(e.target.value, 10) },
          })}
        >
          {!RESISTOR_VALUES.includes(resistance) && <option value="">Custom</option>}
          {RESISTOR_VALUES.map((r) => (
            <option key={r} value={r}>
              {r >= 1000 ? `${r / 1000}kΩ` : `${r}Ω`}
            </option>
          ))}
        </select>
      </PropertyRow>
      <CollapsibleSection title="Custom value">
        <PropertyRow label="Ohms">
          <Input
            className={inputClass}
            type="number"
            min={1}
            value={resistance}
            onChange={(e) => {
              const v = parseInt((e.target as HTMLInputElement).value, 10);
              if (v > 0) onUpdate({ properties: { ...component.properties, resistance: v } });
            }}
          />
        </PropertyRow>
      </CollapsibleSection>
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
      <PropertyRow label="Press">
        <button
          type="button"
          onPointerDown={handlePress}
          onPointerUp={handleRelease}
          onPointerLeave={handleRelease}
          className={cn(
            "w-full select-none rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            isPressed
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-foreground/90 hover:bg-accent active:bg-primary active:text-primary-foreground",
          )}
        >
          {isPressed ? "Pressed" : "Hold to press"}
        </button>
      </PropertyRow>

      {!canDrivePress && (
        <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-400">
          Wire one side to an Arduino input pin and the opposite side to
          {isPullup ? " GND" : " 5V/3V3"}.
        </div>
      )}

      <CollapsibleSection title="Pins" defaultOpen>
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
      </CollapsibleSection>
    </>
  );
}

const SERVO_MIN_PULSE_US = 544;
const SERVO_MAX_PULSE_US = 2400;

function formatSignalPin(pin: number | null): string {
  if (pin == null) return "-";
  return pin >= 14 ? `A${pin - 14}` : `D${pin}`;
}

function ServoInspector({ component, onUpdate, wires, libraryState }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
  wires: Record<string, Wire>;
  libraryState: LibraryState;
}) {
  const configuredAngle = (component.properties.angle as number) ?? 90;
  const signalPin = findArduinoPinForComponentPin(component, "signal", wires);
  const servoState = libraryState.servos[component.id] ??
    Object.values(libraryState.servos).find((entry) => entry.pin === signalPin);
  const liveAngle = servoState?.angle;
  const displayAngle = liveAngle ?? configuredAngle;
  const pulseUs = Math.round(
    SERVO_MIN_PULSE_US +
      (Math.max(0, Math.min(180, displayAngle)) / 180) *
        (SERVO_MAX_PULSE_US - SERVO_MIN_PULSE_US),
  );
  const isLive = liveAngle != null;

  return (
    <>
      <PropertyRow label="Angle">
        <SliderField
          value={configuredAngle}
          min={0}
          max={180}
          valueLabel={`${displayAngle}°`}
          onChange={(v) => onUpdate({
            properties: { ...component.properties, angle: v },
          })}
        />
      </PropertyRow>
      <div className="rounded-md border border-border bg-muted/20 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
        <div className="flex items-center justify-between gap-3">
          <span>Servo pulse</span>
          <span className={cn("font-mono tabular-nums", isLive ? "text-blue-400" : "text-foreground/70")}>
            {formatSignalPin(signalPin)} · {pulseUs}µs @ 50Hz
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-background">
          <div
            className={cn("h-full rounded-full", isLive ? "bg-blue-400" : "bg-foreground/40")}
            style={{
              width: `${Math.max(0, Math.min(100, ((pulseUs - SERVO_MIN_PULSE_US) / (SERVO_MAX_PULSE_US - SERVO_MIN_PULSE_US)) * 100))}%`,
            }}
          />
        </div>
      </div>
      <CollapsibleSection title="Pins" defaultOpen>
        <PropertyRow label="Signal">
          <PinSelect
            value={component.pins.signal ?? null}
            onChange={(pin) => onUpdate({ pins: { ...component.pins, signal: pin } })}
          />
        </PropertyRow>
      </CollapsibleSection>
    </>
  );
}

function BuzzerInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  return (
    <CollapsibleSection title="Pins" defaultOpen>
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
    </CollapsibleSection>
  );
}

function CapacitorInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const capacitance = (component.properties.capacitance as number) ?? 100;
  return (
    <PropertyRow label="Value (µF)">
      <Input
        className={inputClass}
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
  );
}

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  accent = "primary",
}: {
  options: Array<{ key: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  accent?: "primary" | "emerald" | "amber";
}) {
  const activeClass =
    accent === "emerald"
      ? "bg-emerald-500/90 text-white"
      : accent === "amber"
        ? "bg-amber-500 text-zinc-900"
        : "bg-primary text-primary-foreground";
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={String(o.key)}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            value === o.key
              ? activeClass
              : "bg-secondary text-foreground/80 hover:bg-accent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PowerSupplyInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const leftVoltage = (component.properties.leftVoltage as number) ?? 5;
  const rightVoltage = (component.properties.rightVoltage as number) ?? 3.3;
  const voltageOptions = [
    { key: 5, label: "5V" },
    { key: 3.3, label: "3.3V" },
  ];

  return (
    <>
      <PropertyRow label="Left Rail">
        <SegmentedControl
          options={voltageOptions}
          value={leftVoltage}
          accent="emerald"
          onChange={(v) => onUpdate({ properties: { ...component.properties, leftVoltage: v } })}
        />
      </PropertyRow>
      <PropertyRow label="Right Rail">
        <SegmentedControl
          options={voltageOptions}
          value={rightVoltage}
          accent="emerald"
          onChange={(v) => onUpdate({ properties: { ...component.properties, rightVoltage: v } })}
        />
      </PropertyRow>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Each side feeds the adjacent + and − power rails. No wiring required.
      </p>
    </>
  );
}

function MultimeterInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const mode = (component.properties.mode as string | undefined) ?? "volts";
  const modes = [
    { key: "volts" as const, label: "DC V", hint: "Voltage drop between probes (high-Z)" },
    { key: "amps" as const, label: "DC A", hint: "Series current (near-short — put in the current path)" },
    { key: "ohms" as const, label: "Ω", hint: "Resistance between probes (reads component value)" },
  ];
  const activeHint = modes.find((m) => m.key === mode)?.hint ?? "";
  return (
    <>
      <PropertyRow label="Mode">
        <SegmentedControl
          options={modes.map(({ key, label }) => ({ key, label }))}
          value={mode as "volts" | "amps" | "ohms"}
          accent="amber"
          onChange={(v) => onUpdate({ properties: { ...component.properties, mode: v } })}
        />
      </PropertyRow>
      <p className="text-[11px] leading-snug text-muted-foreground">{activeHint}</p>
    </>
  );
}

function PotentiometerInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const value = (component.properties.value as number) ?? 50;
  const [draftValue, setDraftValue] = useState(value);
  const draggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const lastSentRef = useRef(value);

  const flushValue = useCallback((next: number) => {
    pendingRef.current = null;
    if (lastSentRef.current === next) return;
    lastSentRef.current = next;
    onUpdate({
      properties: { ...component.properties, value: next },
    });
  }, [component.properties, onUpdate]);

  useEffect(() => {
    if (draggingRef.current) return;
    setDraftValue(value);
    lastSentRef.current = value;
  }, [value]);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  const scheduleFlush = useCallback((next: number) => {
    pendingRef.current = next;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (pendingRef.current != null) {
        flushValue(pendingRef.current);
      }
    });
  }, [flushValue]);

  return (
    <>
      <PropertyRow label="Position">
        <SliderField
          value={draftValue}
          min={0}
          max={100}
          valueLabel={`${draftValue}%`}
          onChange={(v) => {
            draggingRef.current = true;
            setDraftValue(v);
            scheduleFlush(v);
          }}
          onCommit={(v) => {
            draggingRef.current = false;
            setDraftValue(v);
            if (rafRef.current != null) {
              cancelAnimationFrame(rafRef.current);
              rafRef.current = null;
            }
            flushValue(v);
          }}
        />
      </PropertyRow>
      <CollapsibleSection title="Pins" defaultOpen>
        <PropertyRow label="Signal">
          <PinSelect
            value={component.pins.signal ?? null}
            onChange={(pin) => onUpdate({ pins: { ...component.pins, signal: pin } })}
          />
        </PropertyRow>
      </CollapsibleSection>
    </>
  );
}

function RgbLedInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  return (
    <CollapsibleSection title="Pins" defaultOpen>
      <PropertyRow label="Red">
        <PinSelect value={component.pins.red ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, red: pin } })} />
      </PropertyRow>
      <PropertyRow label="Green">
        <PinSelect value={component.pins.green ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, green: pin } })} />
      </PropertyRow>
      <PropertyRow label="Blue">
        <PinSelect value={component.pins.blue ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, blue: pin } })} />
      </PropertyRow>
      <PropertyRow label="Common">
        <PinSelect value={(component.pins.common ?? component.pins.cathode) ?? null}
          onChange={(pin) => onUpdate({ pins: { ...component.pins, common: pin } })} />
      </PropertyRow>
    </CollapsibleSection>
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
        <SliderField
          value={temp}
          min={-40}
          max={125}
          valueLabel={`${temp}°C`}
          onChange={(v) => onUpdate({
            properties: { ...component.properties, temperature: v },
          })}
        />
      </PropertyRow>
      <CollapsibleSection title="Pins" defaultOpen>
        <PropertyRow label="Signal">
          <PinSelect value={component.pins.signal ?? null}
            onChange={(pin) => onUpdate({ pins: { ...component.pins, signal: pin } })} />
        </PropertyRow>
      </CollapsibleSection>
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
      <PropertyRow label="Light">
        <SliderField
          value={light}
          min={0}
          max={100}
          valueLabel={`${light}%`}
          onChange={(v) => onUpdate({
            properties: { ...component.properties, light: v },
          })}
        />
      </PropertyRow>
      <CollapsibleSection title="Pins" defaultOpen>
        <PropertyRow label="Pin A">
          <PinSelect value={component.pins.a ?? null}
            onChange={(pin) => onUpdate({ pins: { ...component.pins, a: pin } })} />
        </PropertyRow>
        <PropertyRow label="Pin B">
          <PinSelect value={component.pins.b ?? null}
            onChange={(pin) => onUpdate({ pins: { ...component.pins, b: pin } })} />
        </PropertyRow>
      </CollapsibleSection>
    </>
  );
}

function UltrasonicInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const { state: boardState, send: boardSend } = useBoard();
  const env = boardState.environment;

  // Distance is computed exclusively from the canvas environment — place
  // obstacles (or enable room walls) and the ray-cast determines what the
  // HC-SR04 "sees". Out-of-range / no-hit renders as "—" and the sketch's
  // pulseIn() returns 0 (timeout), matching a real sensor.
  const liveDistance = useMemo(() => {
    const segments = environmentToSegments(env, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (segments.length === 0) return null;
    const ray = sensorRay(component);
    const px = raycastDistance(ray, segments);
    if (!isFinite(px)) return null;
    const cm = pixelsToCm(px);
    if (cm > 400) return null;
    return Math.min(400, Math.max(2, Math.round(cm * 10) / 10));
  }, [env, component]);

  const obstacleCount = Object.keys(env.obstacles).length;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <SectionLabel>Environment</SectionLabel>
          <span
            className={cn(
              "font-mono text-[11px] tabular-nums",
              liveDistance !== null ? "text-cyan-400" : "text-muted-foreground",
            )}
          >
            {liveDistance !== null ? `${liveDistance} cm` : "— out of range"}
          </span>
        </div>

        <PropertyRow label="Boundary">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={env.boundaryEnabled}
              className="accent-foreground"
              onChange={(e) => boardSend({
                type: "UPDATE_ENVIRONMENT",
                changes: { boundaryEnabled: e.target.checked },
              })}
            />
            <span className="text-xs text-foreground/80">Room walls</span>
          </label>
        </PropertyRow>

        <PropertyRow label="Obstacles">
          <div className="flex items-center gap-1.5">
            <span className="flex-1 text-xs text-muted-foreground">
              {obstacleCount} placed
            </span>
            <button
              type="button"
              className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground/90 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={() => {
                // Drop the box in front of the sensor (along its beam) so it
                // lands in view, ~45cm out, rather than at a fixed corner.
                const ray = sensorRay(component);
                const cx = ray.ox + ray.dx * 90;
                const cy = ray.oy + ray.dy * 90;
                boardSend({
                  type: "ADD_OBSTACLE",
                  obstacle: { id: `obs_${Date.now()}`, shape: "box", x1: cx - 30, y1: cy - 20, x2: cx + 30, y2: cy + 20, label: "" },
                });
              }}
            >
              + Box
            </button>
            <button
              type="button"
              className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground/90 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={() => {
                // Drop the wall perpendicular to and across the beam, ~45cm out.
                const ray = sensorRay(component);
                const cx = ray.ox + ray.dx * 90;
                const cy = ray.oy + ray.dy * 90;
                const perpX = -ray.dy;
                const perpY = ray.dx;
                boardSend({
                  type: "ADD_OBSTACLE",
                  obstacle: { id: `obs_${Date.now()}`, shape: "wall", x1: cx - perpX * 50, y1: cy - perpY * 50, x2: cx + perpX * 50, y2: cy + perpY * 50, label: "" },
                });
              }}
            >
              + Wall
            </button>
          </div>
        </PropertyRow>

        {Object.values(env.obstacles).map((obs) => (
          <PropertyRow key={obs.id} label={obs.shape === "wall" ? "Wall" : "Box"}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">
                ({Math.round(obs.x1)}, {Math.round(obs.y1)})
              </span>
              <button
                type="button"
                aria-label="Remove obstacle"
                className="rounded px-1 text-xs text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                onClick={() => boardSend({ type: "REMOVE_OBSTACLE", id: obs.id })}
              >
                ×
              </button>
            </div>
          </PropertyRow>
        ))}

        {obstacleCount === 0 && !env.boundaryEnabled && (
          <p className="text-[10px] text-muted-foreground">
            Place an obstacle on the canvas (or enable Room walls) so the sensor
            has something to see. Without an obstacle in range, pulseIn() reads 0.
          </p>
        )}
      </div>

      <CollapsibleSection title="Pins" defaultOpen>
        <PropertyRow label="Trigger">
          <PinSelect value={component.pins.trigger ?? null}
            onChange={(pin) => onUpdate({ pins: { ...component.pins, trigger: pin } })} />
        </PropertyRow>
        <PropertyRow label="Echo">
          <PinSelect value={component.pins.echo ?? null}
            onChange={(pin) => onUpdate({ pins: { ...component.pins, echo: pin } })} />
        </PropertyRow>
      </CollapsibleSection>
    </>
  );
}

function LcdInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  return (
    <CollapsibleSection title="Pins" defaultOpen>
      {["rs", "en", "d4", "d5", "d6", "d7"].map((pin) => (
        <PropertyRow key={pin} label={pin.toUpperCase()}>
          <PinSelect value={component.pins[pin] ?? null}
            onChange={(v) => onUpdate({ pins: { ...component.pins, [pin]: v } })} />
        </PropertyRow>
      ))}
    </CollapsibleSection>
  );
}

function SevenSegmentInspector({ component, onUpdate }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  return (
    <>
      <CollapsibleSection title="Segment pins" defaultOpen>
        {["a", "b", "c", "d", "e", "f", "g", "dp"].map((seg) => (
          <PropertyRow key={seg} label={`Seg ${seg.toUpperCase()}`}>
            <PinSelect value={component.pins[seg] ?? null}
              onChange={(v) => onUpdate({ pins: { ...component.pins, [seg]: v } })} />
          </PropertyRow>
        ))}
      </CollapsibleSection>
      <CollapsibleSection title="Ground">
        <PropertyRow label="Ground">
          <PinSelect
            value={component.pins.gnd ?? null}
            includeGroundPins
            onChange={(v) => onUpdate({ pins: { ...component.pins, gnd: v } })}
          />
        </PropertyRow>
      </CollapsibleSection>
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
        <label className="flex cursor-pointer items-center gap-2">
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
          <span className={cn("text-xs", motion ? "text-amber-400" : "text-muted-foreground")}>
            {motion ? "Detected" : "Idle"}
          </span>
        </label>
      </PropertyRow>
      <CollapsibleSection title="Pins" defaultOpen>
        <PropertyRow label="Signal">
          <PinSelect
            value={component.pins.signal ?? null}
            onChange={(pin) => onUpdate({ pins: { ...component.pins, signal: pin } })}
          />
        </PropertyRow>
      </CollapsibleSection>
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
        <SegmentedControl
          options={[
            { key: "DHT11", label: "DHT11" },
            { key: "DHT22", label: "DHT22" },
          ]}
          value={variant}
          onChange={(v) =>
            onUpdate({ properties: { ...component.properties, variant: v } })
          }
        />
      </PropertyRow>
      <PropertyRow label="Temperature">
        <SliderField
          value={temperature}
          min={tempMin}
          max={tempMax}
          valueLabel={`${temperature}°C`}
          onChange={(v) => onUpdate({
            properties: { ...component.properties, temperature: v },
          })}
        />
      </PropertyRow>
      <PropertyRow label="Humidity">
        <SliderField
          value={humidity}
          min={0}
          max={100}
          valueLabel={`${humidity}%`}
          onChange={(v) => onUpdate({
            properties: { ...component.properties, humidity: v },
          })}
        />
      </PropertyRow>
      <CollapsibleSection title="Pins" defaultOpen>
        <PropertyRow label="Signal">
          <PinSelect
            value={component.pins.signal ?? null}
            onChange={(pin) => onUpdate({ pins: { ...component.pins, signal: pin } })}
          />
        </PropertyRow>
      </CollapsibleSection>
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
        <div className="flex items-center gap-2">
          <Input
            className={cn(inputClass, "flex-1 font-mono")}
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
          <button
            type="button"
            className={cn(
              "shrink-0 rounded-md px-3 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              recent
                ? "bg-amber-500 text-zinc-900"
                : "bg-secondary text-foreground/90 hover:bg-accent",
            )}
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
            {recent ? "Sent" : "Send"}
          </button>
        </div>
      </PropertyRow>
      <CollapsibleSection title="Pins" defaultOpen>
        <PropertyRow label="Signal">
          <PinSelect
            value={component.pins.signal ?? null}
            onChange={(pin) => onUpdate({ pins: { ...component.pins, signal: pin } })}
          />
        </PropertyRow>
      </CollapsibleSection>
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
    <CollapsibleSection title="Pins" defaultOpen>
      {pinEntries.map(([name, value]) => (
        <PropertyRow key={name} label={name}>
          <PinSelect
            value={value}
            onChange={(pin) => onUpdate({ pins: { ...component.pins, [name]: pin } })}
          />
        </PropertyRow>
      ))}
    </CollapsibleSection>
  );
}

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

function renderTypeInspector(
  component: BoardComponent,
  onUpdate: (changes: Partial<BoardComponent>) => void,
  wires: Record<string, Wire>,
  libraryState: LibraryState,
) {
  switch (component.type) {
    case "led": return <LedInspector component={component} onUpdate={onUpdate} />;
    case "rgb_led": return <RgbLedInspector component={component} onUpdate={onUpdate} />;
    case "resistor": return <ResistorInspector component={component} onUpdate={onUpdate} />;
    case "button": return <ButtonInspector component={component} onUpdate={onUpdate} />;
    case "servo": return <ServoInspector component={component} onUpdate={onUpdate} wires={wires} libraryState={libraryState} />;
    case "buzzer": return <BuzzerInspector component={component} onUpdate={onUpdate} />;
    case "capacitor": return <CapacitorInspector component={component} onUpdate={onUpdate} />;
    case "potentiometer": return <PotentiometerInspector component={component} onUpdate={onUpdate} />;
    case "temperature_sensor": return <TemperatureSensorInspector component={component} onUpdate={onUpdate} />;
    case "photoresistor": return <PhotoresistorInspector component={component} onUpdate={onUpdate} />;
    case "ultrasonic_sensor": return <UltrasonicInspector component={component} onUpdate={onUpdate} />;
    case "lcd_16x2": return <LcdInspector component={component} onUpdate={onUpdate} />;
    case "seven_segment": return <SevenSegmentInspector component={component} onUpdate={onUpdate} />;
    case "pir_sensor": return <PirSensorInspector component={component} onUpdate={onUpdate} />;
    case "dht_sensor": return <DhtSensorInspector component={component} onUpdate={onUpdate} />;
    case "ir_receiver": return <IrReceiverInspector component={component} onUpdate={onUpdate} />;
    case "power_supply": return <PowerSupplyInspector component={component} onUpdate={onUpdate} />;
    case "multimeter": return <MultimeterInspector component={component} onUpdate={onUpdate} />;
    default: return <GenericPinInspector component={component} onUpdate={onUpdate} />;
  }
}

function ComponentHeader({
  component,
  onUpdate,
}: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
}) {
  const typeLabel = TYPE_LABELS[component.type] ?? component.type;
  const docsPath = DOCS_PATHS[component.type];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {typeLabel}
        </div>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
          R{component.y + 1}·C{component.x}
        </span>
      </div>
      <Input
        className={cn(inputClass, "h-8 border-transparent bg-transparent px-0 text-sm font-semibold text-foreground shadow-none hover:border-border focus:border-border")}
        value={component.name}
        onChange={(e) => onUpdate({ name: (e.target as HTMLInputElement).value })}
      />
      {docsPath && (
        <a
          href={docsPath}
          className="inline-flex w-fit items-center gap-1.5 rounded text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <svg viewBox="0 0 16 16" width={11} height={11} className="shrink-0" aria-hidden>
            <path d="M2 2h8l4 4v8H2V2z" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
            <line x1={10} y1={2} x2={10} y2={6} stroke="currentColor" strokeWidth={1.5} />
            <line x1={10} y1={6} x2={14} y2={6} stroke="currentColor" strokeWidth={1.5} />
          </svg>
          Documentation
        </a>
      )}
    </div>
  );
}

function ComponentInspector({ component, onUpdate, wires, libraryState }: {
  component: BoardComponent;
  onUpdate: (changes: Partial<BoardComponent>) => void;
  wires: Record<string, Wire>;
  libraryState: LibraryState;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ComponentHeader component={component} onUpdate={onUpdate} />
      <div className="flex flex-col gap-3">
        {renderTypeInspector(component, onUpdate, wires, libraryState)}
      </div>
    </div>
  );
}

export default function Inspector() {
  const { state: boardState, send: boardSend } = useBoard();
  const { state: graphState } = useGraph();

  const hasGraphSelection =
    graphState.selectedNodeIds.size > 0 ||
    graphState.selectedEdgeIds.size > 0;

  if (hasGraphSelection) {
    return (
      <div className="flex h-full flex-col overflow-hidden overflow-y-auto bg-card">
        <GraphInspector />
      </div>
    );
  }

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
      boardSend({ type: "REMOVE_WIRE", id: boardState.selectedId });
      boardSend({ type: "ADD_WIRE", wire: { ...selectedWire, ...changes } });
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

  if (!selectedComponent && !selectedWire) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-card">
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Select a component or wire to inspect its properties
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-5">
          {selectedComponent && (
            <>
              <ComponentInspector
                component={selectedComponent}
                onUpdate={handleComponentUpdate}
                wires={boardState.wires}
                libraryState={boardState.libraryState}
              />
              <ComponentWarnings componentId={selectedComponent.id} />
            </>
          )}
          {selectedWire && (
            <WireInspector wire={selectedWire} onUpdate={handleWireUpdate} />
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={handleDelete}
          className="w-full rounded-md bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 active:bg-destructive/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
        >
          Delete {selectedWire ? "Wire" : "Component"}
        </button>
      </div>
    </div>
  );
}
