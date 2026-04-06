import React from "react";
import type { ComponentType } from "@dreamer/schemas";
import { breadboardInteractionActor } from "./breadboard-interaction";

type PaletteItem = {
  type: ComponentType;
  label: string;
  icon: React.ReactNode;
  defaultProps?: Record<string, unknown>;
  action?: "place" | "wire";
};

const PALETTE_ITEMS: PaletteItem[] = [
  {
    type: "arduino_uno",
    label: "Arduino Uno",
    icon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={2} y={4} width={20} height={16} rx={2} fill="#2B7EBF" stroke="#1A5F8B" strokeWidth={1} />
        <rect x={0} y={7} width={5} height={4} rx={1} fill="#a0a0a0" stroke="#808080" strokeWidth={0.5} />
        <text x={12} y={14} textAnchor="middle" fontSize={4} fill="#fff" fontWeight="bold">UNO</text>
        <circle cx={5} cy={6} r={1} fill="#ef4444" />
        <g>
          {[0,1,2,3,4,5,6].map(i => (
            <circle key={`t${i}`} cx={6 + i * 2} cy={4} r={0.7} fill="#ffd54f" />
          ))}
          {[0,1,2,3,4].map(i => (
            <circle key={`b${i}`} cx={8 + i * 2} cy={20} r={0.7} fill="#81c784" />
          ))}
        </g>
      </svg>
    ),
  },
  {
    type: "led",
    label: "LED",
    icon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <path d="M12 4 L18 14 L6 14 Z" fill="#ef4444" opacity={0.8} stroke="#b91c1c" strokeWidth={0.5} />
        <line x1={6} y1={14} x2={18} y2={14} stroke="#b91c1c" strokeWidth={1.5} />
        <line x1={10} y1={14} x2={9} y2={22} stroke="#999" strokeWidth={1} />
        <line x1={14} y1={14} x2={15} y2={22} stroke="#999" strokeWidth={1} />
        <line x1={17} y1={7} x2={21} y2={4} stroke="#ef4444" strokeWidth={0.8} />
        <line x1={19} y1={9} x2={23} y2={6} stroke="#ef4444" strokeWidth={0.8} />
      </svg>
    ),
    defaultProps: { color: "#ef4444" },
  },
  {
    type: "button",
    label: "Push Button",
    icon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={4} y={6} width={16} height={12} rx={2} fill="#2a2a2a" stroke="#555" strokeWidth={1} />
        <circle cx={12} cy={12} r={4} fill="#555" stroke="#777" strokeWidth={0.5} />
        <line x1={4} y1={9} x2={1} y2={9} stroke="#a0a0a0" strokeWidth={1.2} />
        <line x1={4} y1={15} x2={1} y2={15} stroke="#a0a0a0" strokeWidth={1.2} />
        <line x1={20} y1={9} x2={23} y2={9} stroke="#a0a0a0" strokeWidth={1.2} />
        <line x1={20} y1={15} x2={23} y2={15} stroke="#a0a0a0" strokeWidth={1.2} />
      </svg>
    ),
  },
  {
    type: "resistor",
    label: "Resistor",
    icon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <line x1={1} y1={12} x2={5} y2={12} stroke="#999" strokeWidth={1.5} />
        <rect x={5} y={9} width={14} height={6} rx={1.5} fill="#e8d5b7" stroke="#a3a3a3" strokeWidth={1} />
        <rect x={8} y={9} width={2} height={6} fill="#8B4513" />
        <rect x={11} y={9} width={2} height={6} fill="#FF0000" />
        <rect x={14} y={9} width={2} height={6} fill="#8B4513" />
        <line x1={19} y1={12} x2={23} y2={12} stroke="#999" strokeWidth={1.5} />
      </svg>
    ),
    defaultProps: { resistance: 220 },
  },
  {
    type: "capacitor",
    label: "Capacitor",
    icon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <line x1={4} y1={12} x2={10} y2={12} stroke="#999" strokeWidth={1.5} />
        <line x1={10} y1={5} x2={10} y2={19} stroke="#333" strokeWidth={2} />
        <path d="M14 5 Q13 12 14 19" fill="none" stroke="#333" strokeWidth={2} />
        <line x1={14} y1={12} x2={20} y2={12} stroke="#999" strokeWidth={1.5} />
        <text x={7} y={22} fontSize={5} fill="#666">+</text>
      </svg>
    ),
  },
  {
    type: "servo",
    label: "Servo Motor",
    icon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={3} y={6} width={14} height={12} rx={2} fill="#3b82f6" stroke="#1e40af" strokeWidth={1} />
        <circle cx={10} cy={12} r={3} fill="#dbeafe" stroke="#93c5fd" strokeWidth={0.5} />
        <line x1={10} y1={12} x2={16} y2={10} stroke="#fbbf24" strokeWidth={2} strokeLinecap="round" />
        <line x1={17} y1={16} x2={22} y2={16} stroke="#f97316" strokeWidth={1.2} />
        <line x1={17} y1={18} x2={22} y2={18} stroke="#ef4444" strokeWidth={1.2} />
        <line x1={17} y1={20} x2={22} y2={20} stroke="#78716c" strokeWidth={1.2} />
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
        <circle cx={12} cy={12} r={4} fill="#374151" stroke="#4b5563" strokeWidth={0.5} />
        <circle cx={12} cy={12} r={1.5} fill="#4b5563" />
        <text x={6} y={8} fontSize={5} fill="#888">+</text>
      </svg>
    ),
  },
  {
    type: "potentiometer",
    label: "Potentiometer",
    icon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <circle cx={12} cy={13} r={8} fill="#78716c" stroke="#57534e" strokeWidth={1} />
        <line x1={12} y1={13} x2={12} y2={5} stroke="#fbbf24" strokeWidth={2} strokeLinecap="round" />
        <circle cx={12} cy={13} r={2} fill="#57534e" />
        <line x1={4} y1={20} x2={4} y2={24} stroke="#a0a0a0" strokeWidth={1} />
        <line x1={12} y1={21} x2={12} y2={24} stroke="#a0a0a0" strokeWidth={1} />
        <line x1={20} y1={20} x2={20} y2={24} stroke="#a0a0a0" strokeWidth={1} />
      </svg>
    ),
  },
  {
    type: "lcd_16x2",
    label: "LCD 16×2",
    icon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <rect x={1} y={5} width={22} height={14} rx={1} fill="#065f46" stroke="#064e3b" strokeWidth={1} />
        <rect x={3} y={7} width={18} height={10} rx={0.5} fill="#a7f3d0" />
        <text x={12} y={14} textAnchor="middle" fontSize={4} fill="#065f46">Hello!</text>
      </svg>
    ),
  },
  // ── Jumper Wire ──
  {
    type: "wire",
    label: "Jumper Wire",
    action: "wire",
    icon: (
      <svg viewBox="0 0 24 24" width={20} height={20}>
        <line x1={2} y1={20} x2={22} y2={4} stroke="#fbbf24" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={2} cy={20} r={2} fill="#fbbf24" stroke="#b45309" strokeWidth={0.5} />
        <circle cx={22} cy={4} r={2} fill="#fbbf24" stroke="#b45309" strokeWidth={0.5} />
      </svg>
    ),
  },
];

function handleItemClick(item: PaletteItem) {
  if (item.action === "wire") {
    // Wire mode: user clicks two breadboard holes to create a wire
    breadboardInteractionActor.send({ type: "START_PLACE", componentType: "wire" });
  } else if (item.type === "arduino_uno") {
    // Arduino Uno is already fixed on the canvas — no action needed
    return;
  } else {
    breadboardInteractionActor.send({ type: "START_PLACE", componentType: item.type });
  }
}

function PaletteItemButton({ item }: { item: PaletteItem }) {
  const isArduino = item.type === "arduino_uno";
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-700/60 active:bg-neutral-700 ${isArduino ? "opacity-50 cursor-default" : ""}`}
      onClick={() => handleItemClick(item)}
      title={isArduino ? "Arduino Uno is already on the canvas" : undefined}
    >
      <span className="flex-shrink-0">{item.icon}</span>
      <span className="truncate">{item.label}</span>
      {isArduino && <span className="ml-auto text-[9px] text-neutral-500">placed</span>}
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
