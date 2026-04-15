import React, { useState, useMemo, useRef, useEffect } from "react";
import { BOARD_TARGETS, DEFAULT_BOARD_TARGET, type BoardTarget, type ComponentType } from "@dreamer/schemas";
import { breadboardInteractionActor } from "./breadboard-interaction";
import { COMPONENT_REGISTRY } from "@/components/registry";
import { useBoard } from "@/store/board-context";

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
  } else {
    breadboardInteractionActor.send({ type: "START_PLACE", componentType: item.type });
  }
}

function PaletteItemButton({
  item,
}: {
  item: PaletteItem;
}) {
  return (
    <button
      type="button"
      className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-700/60 active:bg-neutral-700"
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
    </button>
  );
}

const MemoizedPaletteItem = React.memo(PaletteItemButton);

function ComponentPaletteInner() {
  const { state, send } = useBoard();
  const activeBoardTarget = (state.boardTarget ?? DEFAULT_BOARD_TARGET) as BoardTarget;
  const setBoardTarget = (target: BoardTarget) => {
    send({ type: "SET_BOARD_TARGET", boardTarget: target });
  };
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
      {/* Board Target Selector */}
      <div className="px-2 pt-2 pb-1">
        <label className="mb-1 block px-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          Board
        </label>
        <select
          value={activeBoardTarget}
          onChange={(e) => setBoardTarget(e.target.value as BoardTarget)}
          className="w-full rounded-md border border-neutral-600 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-200 outline-none focus:border-blue-500"
          title={`${BOARD_TARGETS[activeBoardTarget].label} • ${BOARD_TARGETS[activeBoardTarget].mcu}`}
        >
          {Object.values(BOARD_TARGETS).map((target) => (
            <option key={target.id} value={target.id}>
              {target.label}
            </option>
          ))}
        </select>
        <p className="mt-1 px-0.5 text-[9px] text-neutral-500">
          The board is fixed on canvas; switch model here.
        </p>
      </div>

      {/* Search */}
      <div className="px-2 pb-1">
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
              <MemoizedPaletteItem
                key={item.type}
                item={item}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export const ComponentPalette = React.memo(ComponentPaletteInner);
