import React, { useMemo } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
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

function openCommandPalette() {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
  );
}

const TOOLTIP_POPUP_CLASS =
  "bg-popover text-popover-foreground border border-border rounded-md px-2 py-1 text-xs shadow-md max-w-[240px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0";

function PaletteItemButton({
  item,
}: {
  item: PaletteItem;
}) {
  const button = (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground/90 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none active:bg-accent/80"
      onClick={() => handleItemClick(item)}
    >
      <span className="flex-shrink-0">{item.icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{item.label}</span>
      </span>
    </button>
  );

  if (!item.description) {
    return button;
  }

  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={button} />
      <Tooltip.Portal>
        <Tooltip.Positioner side="right" align="center" sideOffset={8}>
          <Tooltip.Popup className={TOOLTIP_POPUP_CLASS}>
            {item.description}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

const MemoizedPaletteItem = React.memo(PaletteItemButton);

function ComponentPaletteInner() {
  const { state, send } = useBoard();
  const activeBoardTarget = (state.boardTarget ?? DEFAULT_BOARD_TARGET) as BoardTarget;
  const setBoardTarget = (target: BoardTarget) => {
    send({ type: "SET_BOARD_TARGET", boardTarget: target });
  };

  // Group by category
  const grouped = useMemo(() => {
    const groups = new Map<string, PaletteItem[]>();
    for (const item of ALL_ITEMS) {
      const cat = item.category;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }
    // Sort groups by CATEGORY_ORDER
    const order = ["board", ...CATEGORY_ORDER, "wire"];
    return [...groups.entries()].sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
    );
  }, []);

  return (
    <Tooltip.Provider delay={400}>
      <div className="flex h-full flex-col bg-card">
        {/* Board Target Selector */}
        <div className="px-3 py-2 border-b border-border">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Board
          </label>
          <select
            value={activeBoardTarget}
            onChange={(e) => setBoardTarget(e.target.value as BoardTarget)}
            className="w-full rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-foreground outline-none transition-colors hover:bg-accent focus-visible:border-accent-foreground/40"
            title={`${BOARD_TARGETS[activeBoardTarget].label} • ${BOARD_TARGETS[activeBoardTarget].mcu}`}
          >
            {Object.values(BOARD_TARGETS).map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-muted-foreground">
            The board is fixed on canvas; switch model here.
          </p>
        </div>

        {/* Cmd+K hint */}
        <button
          type="button"
          onClick={openCommandPalette}
          className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none"
        >
          <span>Search components</span>
          <span className="flex items-center gap-1">
            <kbd className="inline-flex min-w-[18px] items-center justify-center rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
              ⌘
            </kbd>
            <kbd className="inline-flex min-w-[18px] items-center justify-center rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
              K
            </kbd>
          </span>
        </button>

        {/* Grouped list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {grouped.map(([category, items]) => (
            <div key={category} className="mt-2 first:mt-0">
              <h3 className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
    </Tooltip.Provider>
  );
}

export const ComponentPalette = React.memo(ComponentPaletteInner);
