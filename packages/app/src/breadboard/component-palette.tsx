import React from "react";
import type { ComponentType } from "@dreamer/schemas";
import { breadboardInteractionActor } from "./breadboard-interaction";

type PaletteItem = {
  type: ComponentType;
  label: string;
  icon: React.ReactNode;
  defaultProps?: Record<string, unknown>;
};

const PALETTE_ITEMS: PaletteItem[] = [
  {
    type: "arduino_uno",
    label: "Arduino Uno",
    icon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={2} y={5} width={20} height={14} rx={2} fill="#0066a2" stroke="#004c7a" strokeWidth={1} />
        <text x={12} y={14} textAnchor="middle" fontSize={5} fill="#fff">UNO</text>
      </svg>
    ),
  },
  {
    type: "led",
    label: "LED (red)",
    icon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <circle cx={12} cy={10} r={6} fill="#ef4444" opacity={0.8} />
        <line x1={12} y1={16} x2={10} y2={22} stroke="#999" strokeWidth={1} />
        <line x1={12} y1={16} x2={14} y2={22} stroke="#999" strokeWidth={1} />
      </svg>
    ),
    defaultProps: { color: "#ef4444" },
  },
  {
    type: "button",
    label: "Button",
    icon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={4} y={6} width={16} height={12} rx={3} fill="#d4d4d4" stroke="#737373" strokeWidth={1} />
        <circle cx={12} cy={12} r={4} fill="#737373" />
      </svg>
    ),
  },
  {
    type: "resistor",
    label: "Resistor (220\u03A9)",
    icon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <line x1={2} y1={12} x2={6} y2={12} stroke="#999" strokeWidth={1.5} />
        <rect x={6} y={9} width={12} height={6} rx={1} fill="#e8d5b7" stroke="#a3a3a3" strokeWidth={1} />
        <line x1={18} y1={12} x2={22} y2={12} stroke="#999" strokeWidth={1.5} />
      </svg>
    ),
    defaultProps: { resistance: 220 },
  },
  {
    type: "servo",
    label: "Servo",
    icon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={4} y={6} width={16} height={12} rx={2} fill="#3b82f6" stroke="#1e40af" strokeWidth={1} />
        <circle cx={12} cy={12} r={3} fill="#dbeafe" />
        <line x1={12} y1={12} x2={18} y2={12} stroke="#fbbf24" strokeWidth={2} strokeLinecap="round" />
      </svg>
    ),
    defaultProps: { angle: 90 },
  },
  {
    type: "buzzer",
    label: "Buzzer",
    icon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <circle cx={12} cy={12} r={8} fill="#1f2937" stroke="#374151" strokeWidth={1} />
        <circle cx={12} cy={12} r={3} fill="#4b5563" />
      </svg>
    ),
  },
  {
    type: "potentiometer",
    label: "Potentiometer",
    icon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <circle cx={12} cy={12} r={8} fill="#78716c" stroke="#57534e" strokeWidth={1} />
        <line x1={12} y1={12} x2={12} y2={4} stroke="#fbbf24" strokeWidth={2} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: "lcd_16x2",
    label: "LCD 16x2",
    icon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={2} y={5} width={20} height={14} rx={1} fill="#065f46" stroke="#064e3b" strokeWidth={1} />
        <rect x={4} y={7} width={16} height={10} rx={0.5} fill="#a7f3d0" />
        <text x={12} y={14} textAnchor="middle" fontSize={4} fill="#065f46">LCD</text>
      </svg>
    ),
  },
];

function handleStartPlace(type: ComponentType) {
  breadboardInteractionActor.send({ type: "START_PLACE", componentType: type });
}

function PaletteItemButton({ item }: { item: PaletteItem }) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-700/60 active:bg-neutral-700"
      onClick={() => handleStartPlace(item.type)}
    >
      <span className="flex-shrink-0">{item.icon}</span>
      <span className="truncate">{item.label}</span>
    </button>
  );
}

const MemoizedPaletteItem = React.memo(PaletteItemButton);

function ComponentPaletteInner() {
  return (
    <div className="flex h-full flex-col gap-0.5 overflow-y-auto bg-neutral-800 p-2">
      <h3 className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
        Components
      </h3>
      {PALETTE_ITEMS.map((item) => (
        <MemoizedPaletteItem key={item.type} item={item} />
      ))}
    </div>
  );
}

export const ComponentPalette = React.memo(ComponentPaletteInner);
