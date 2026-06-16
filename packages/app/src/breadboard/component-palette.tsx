import React, { useCallback, useMemo } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { Plus, Pencil } from "lucide-react";
import { isCustomComponentType, type PlaceableComponentType } from "@dreamer/schemas";
import { breadboardInteractionActor } from "./breadboard-interaction";
import type { ComponentDefinition } from "@/components/component-definition";
import { useComponentCatalog } from "@/components/catalog/use-component-catalog";
import { requestCustomPartEditor, type CustomPartEditTarget } from "@/components/catalog/custom-parts-editor-store";
import { useDockviewApi } from "@/store/dockview-context";
import { showPanel } from "@/store/view-panels";
import { cn } from "@/utils/classnames";

type PaletteItem = {
  type: PlaceableComponentType;
  label: string;
  icon: React.ReactNode;
  category: string;
  description?: string;
  action?: "place" | "wire";
  isCustom?: boolean;
};

const CATEGORY_ORDER = ["output", "input", "passive", "display", "other"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  board: "Board",
  output: "Output",
  input: "Input",
  passive: "Passive",
  display: "Display",
  other: "Other",
  custom: "Custom",
  wire: "Wiring",
};
// Custom always shows (even empty) so authoring is discoverable from the palette.
const GROUP_ORDER = ["board", ...CATEGORY_ORDER, "custom", "wire"];

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

function buildItems(catalog: ComponentDefinition[]): PaletteItem[] {
  return [
    ...catalog.map((def) => {
      const isCustom = isCustomComponentType(def.type);
      return {
        // Registry/catalog types are always valid placeable types.
        type: def.type as PlaceableComponentType,
        label: def.label,
        icon: def.paletteIcon,
        // Group all custom parts together rather than by their declared category.
        category: isCustom ? "custom" : def.category ?? "other",
        description: def.description,
        isCustom,
      };
    }),
    WIRE_PALETTE_ITEM,
  ];
}

function customIdFromType(type: string): string {
  return type.replace(/^custom:/, "");
}

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
  onEdit,
}: {
  item: PaletteItem;
  onEdit?: () => void;
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

  const place = item.description ? (
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
  ) : (
    button
  );

  if (!onEdit) return place;

  // Custom parts: place button + a hover Edit affordance.
  return (
    <div className="group flex items-center gap-0.5">
      <div className="min-w-0 flex-1">{place}</div>
      <button
        type="button"
        onClick={onEdit}
        title="Edit part"
        className="flex-shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
      >
        <Pencil className="size-3" />
      </button>
    </div>
  );
}

const MemoizedPaletteItem = React.memo(PaletteItemButton);

function ComponentPaletteInner() {
  const catalog = useComponentCatalog();
  const api = useDockviewApi();

  const openEditor = useCallback(
    (target: CustomPartEditTarget) => {
      requestCustomPartEditor(target);
      showPanel(api, "customParts");
    },
    [api],
  );

  // Group by category (rebuilds when a custom part is registered/removed).
  const grouped = useMemo(() => {
    const groups = new Map<string, PaletteItem[]>();
    for (const item of buildItems(catalog)) {
      if (!groups.has(item.category)) groups.set(item.category, []);
      groups.get(item.category)?.push(item);
    }
    if (!groups.has("custom")) groups.set("custom", []);
    return [...groups.entries()].sort(
      (a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]),
    );
  }, [catalog]);

  return (
    <Tooltip.Provider delay={400}>
      <div className="flex h-full flex-col bg-card">
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
              <div className="mb-1 flex items-center justify-between px-1">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {CATEGORY_LABELS[category] ?? category}
                </h3>
                {category === "custom" && (
                  <button
                    type="button"
                    onClick={() => openEditor({ kind: "new" })}
                    title="New custom part"
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <Plus className="size-3.5" />
                  </button>
                )}
              </div>
              {category === "custom" && items.length === 0 && (
                <button
                  type="button"
                  onClick={() => openEditor({ kind: "new" })}
                  className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Plus className="size-3.5" /> New custom part
                </button>
              )}
              {items.map((item) => (
                <MemoizedPaletteItem
                  key={item.type}
                  item={item}
                  onEdit={
                    item.isCustom
                      ? () => openEditor({ kind: "edit", id: customIdFromType(item.type) })
                      : undefined
                  }
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
