import React from "react";
import type { ComponentType } from "@dreamer/schemas";
import { breadboardInteractionActor } from "./breadboard-interaction";
import { COMPONENT_REGISTRY } from "@/components/registry";

type PaletteItem = {
  type: ComponentType;
  label: string;
  icon: React.ReactNode;
  defaultProps?: Record<string, unknown>;
  action?: "place" | "wire";
};

const ARDUINO_PALETTE_ITEM: PaletteItem = {
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
};

const WIRE_PALETTE_ITEM: PaletteItem = {
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
};

const PALETTE_ITEMS: PaletteItem[] = [
  ARDUINO_PALETTE_ITEM,
  ...COMPONENT_REGISTRY.map(def => ({
    type: def.type as ComponentType,
    label: def.label,
    icon: def.paletteIcon,
  })),
  WIRE_PALETTE_ITEM,
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
