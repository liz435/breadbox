import React, { useState, useMemo, useRef, useEffect } from "react";
import type { ComponentType } from "@dreamer/schemas";
import { breadboardInteractionActor } from "./breadboard-interaction";
import { COMPONENT_REGISTRY } from "@/components/registry";

type PaletteItem = {
  type: ComponentType;
  label: string;
  icon: React.ReactNode;
  category: string;
  description?: string;
  action?: "place" | "wire";
};

const CATEGORY_ORDER = ["output", "input", "passive", "display", "other"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  board: "Board",
  output: "Output",
  input: "Input",
  passive: "Passive",
  display: "Display",
  other: "Other",
  wire: "Wiring",
};

const ARDUINO_PALETTE_ITEM: PaletteItem = {
  type: "arduino_uno",
  label: "Arduino Uno",
  category: "board",
  description: "ATmega328P microcontroller board",
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
  category: "wire",
  description: "Connect two points on the breadboard",
  action: "wire",
  icon: (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <line x1={2} y1={20} x2={22} y2={4} stroke="#fbbf24" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={2} cy={20} r={2} fill="#fbbf24" stroke="#b45309" strokeWidth={0.5} />
      <circle cx={22} cy={4} r={2} fill="#fbbf24" stroke="#b45309" strokeWidth={0.5} />
    </svg>
  ),
};

const ALL_ITEMS: PaletteItem[] = [
  ARDUINO_PALETTE_ITEM,
  ...COMPONENT_REGISTRY.map(def => ({
    type: def.type as ComponentType,
    label: def.label,
    icon: def.paletteIcon,
    category: def.category ?? "other",
    description: def.description,
  })),
  WIRE_PALETTE_ITEM,
];

function handleItemClick(item: PaletteItem) {
  if (item.action === "wire") {
    breadboardInteractionActor.send({ type: "START_PLACE", componentType: "wire" });
  } else if (item.type === "arduino_uno") {
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
      className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-700/60 active:bg-neutral-700 ${isArduino ? "opacity-50 cursor-default" : ""}`}
      onClick={() => handleItemClick(item)}
      title={item.description ?? item.label}
    >
      <span className="flex-shrink-0">{item.icon}</span>
      <span className="flex flex-col min-w-0">
        <span className="truncate">{item.label}</span>
        {item.description && (
          <span className="truncate text-[9px] text-neutral-500 leading-tight hidden group-hover:block">
            {item.description}
          </span>
        )}
      </span>
      {isArduino && <span className="ml-auto text-[9px] text-neutral-500">placed</span>}
    </button>
  );
}

const MemoizedPaletteItem = React.memo(PaletteItemButton);

function ComponentPaletteInner() {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return ALL_ITEMS;
    const q = search.toLowerCase();
    return ALL_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q),
    );
  }, [search]);

  // Group by category
  const grouped = useMemo(() => {
    const groups = new Map<string, PaletteItem[]>();
    for (const item of filtered) {
      const cat = item.category;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }
    // Sort groups by CATEGORY_ORDER
    const order = ["board", ...CATEGORY_ORDER, "wire"];
    return [...groups.entries()].sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
    );
  }, [filtered]);

  return (
    <div className="flex h-full flex-col bg-neutral-800">
      {/* Search */}
      <div className="px-2 pt-2 pb-1">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search components..."
          className="w-full rounded-md border border-neutral-600 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 outline-none focus:border-blue-500"
        />
      </div>

      {/* Grouped list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {grouped.length === 0 && (
          <p className="px-1 pt-2 text-[10px] text-neutral-500">No components match "{search}"</p>
        )}
        {grouped.map(([category, items]) => (
          <div key={category} className="mt-1.5 first:mt-0">
            <h3 className="mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              {CATEGORY_LABELS[category] ?? category}
            </h3>
            {items.map((item) => (
              <MemoizedPaletteItem key={item.type} item={item} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export const ComponentPalette = React.memo(ComponentPaletteInner);
