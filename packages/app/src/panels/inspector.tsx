import { useMemo } from "react";
import { Field } from "@base-ui/react/field";
import { NumberField } from "@base-ui/react/number-field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { useScene } from "../store/scene-context";
import { useGraph } from "../store/graph-context";
import { TileBrushPalette } from "./tile-brush-palette";
import { GraphInspector } from "./graph-inspector";

export default function Inspector() {
  const { state, send } = useScene();
  const { state: graphState } = useGraph();

  const selected = useMemo(() => {
    if (!state.selectedId) return null;
    return state.sprites.find((s) => s.id === state.selectedId) ?? null;
  }, [state]);

  function toDeg(rad: number) {
    return Math.round(((rad * 180) / Math.PI) * 10) / 10;
  }

  function toRad(deg: number) {
    return (deg * Math.PI) / 180;
  }

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

  // Tilemap info when no sprite is selected
  if (state.tilemap && !selected) {
    const totalPixelsW = state.tilemap.width * state.tilemap.tileSize;
    const totalPixelsH = state.tilemap.height * state.tilemap.tileSize;
    return (
      <div className="h-full bg-card flex flex-col overflow-hidden">
        <div className="p-3 flex flex-col gap-3">
          <Label>Tilemap</Label>
          <Separator />
          <div className="flex gap-2">
            <div className="flex-1">
              <Label>Cols</Label>
              <div className="text-sm mt-1">{state.tilemap.width}</div>
            </div>
            <div className="flex-1">
              <Label>Rows</Label>
              <div className="text-sm mt-1">{state.tilemap.height}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label>Tile Size</Label>
              <div className="text-sm mt-1">{state.tilemap.tileSize}px</div>
            </div>
            <div className="flex-1">
              <Label>Total</Label>
              <div className="text-sm mt-1">{totalPixelsW}&times;{totalPixelsH}px</div>
            </div>
          </div>
          <Separator />
          <TileBrushPalette />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-card flex flex-col overflow-hidden">
      {!selected ? (
        <div className="px-3 py-4 text-xs text-muted-foreground">Select a sprite</div>
      ) : (
        <div className="p-3 flex flex-col gap-3">
          <Field.Root>
            <Field.Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Name
            </Field.Label>
            <Input
              className="h-auto px-2 py-1"
              value={selected.name}
              onChange={(e) => {
                if (!state.selectedId) return;
                send({
                  type: "UPDATE",
                  id: state.selectedId,
                  changes: { name: (e.target as HTMLInputElement).value },
                });
              }}
            />
          </Field.Root>
          <Separator />
          <div className="flex gap-2">
            <NumberField.Root
              value={Math.round(selected.x)}
              onValueChange={(val) => {
                if (val == null || !state.selectedId) return;
                send({ type: "UPDATE", id: state.selectedId, changes: { x: val } });
              }}
            >
              <NumberField.ScrubArea>
                <Label className="cursor-ew-resize">X</Label>
              </NumberField.ScrubArea>
              <NumberField.Group>
                <NumberField.Input className="bg-input border border-border rounded px-2 py-1 text-sm outline-none w-full transition-colors focus:border-ring" />
              </NumberField.Group>
            </NumberField.Root>
            <NumberField.Root
              value={Math.round(selected.y)}
              onValueChange={(val) => {
                if (val == null || !state.selectedId) return;
                send({ type: "UPDATE", id: state.selectedId, changes: { y: val } });
              }}
            >
              <NumberField.ScrubArea>
                <Label className="cursor-ew-resize">Y</Label>
              </NumberField.ScrubArea>
              <NumberField.Group>
                <NumberField.Input className="bg-input border border-border rounded px-2 py-1 text-sm outline-none w-full transition-colors focus:border-ring" />
              </NumberField.Group>
            </NumberField.Root>
          </div>
          <div className="flex gap-2">
            <NumberField.Root
              value={Math.round(selected.width * Math.abs(selected.scaleX))}
              min={1}
              onValueChange={(val) => {
                if (val == null || val <= 0 || !state.selectedId) return;
                send({
                  type: "UPDATE",
                  id: state.selectedId,
                  changes: {
                    scaleX: (val / selected.width) * Math.sign(selected.scaleX || 1),
                  },
                });
              }}
            >
              <NumberField.ScrubArea>
                <Label className="cursor-ew-resize">W</Label>
              </NumberField.ScrubArea>
              <NumberField.Group>
                <NumberField.Input className="bg-input border border-border rounded px-2 py-1 text-sm outline-none w-full transition-colors focus:border-ring" />
              </NumberField.Group>
            </NumberField.Root>
            <NumberField.Root
              value={Math.round(selected.height * Math.abs(selected.scaleY))}
              min={1}
              onValueChange={(val) => {
                if (val == null || val <= 0 || !state.selectedId) return;
                send({
                  type: "UPDATE",
                  id: state.selectedId,
                  changes: {
                    scaleY: (val / selected.height) * Math.sign(selected.scaleY || 1),
                  },
                });
              }}
            >
              <NumberField.ScrubArea>
                <Label className="cursor-ew-resize">H</Label>
              </NumberField.ScrubArea>
              <NumberField.Group>
                <NumberField.Input className="bg-input border border-border rounded px-2 py-1 text-sm outline-none w-full transition-colors focus:border-ring" />
              </NumberField.Group>
            </NumberField.Root>
          </div>
          <Separator />
          <NumberField.Root
            value={toDeg(selected.rotation)}
            onValueChange={(val) => {
              if (val == null || !state.selectedId) return;
              send({
                type: "UPDATE",
                id: state.selectedId,
                changes: { rotation: toRad(val) },
              });
            }}
          >
            <NumberField.ScrubArea>
              <Label className="cursor-ew-resize">Rotation</Label>
            </NumberField.ScrubArea>
            <NumberField.Group>
              <NumberField.Input className="bg-input border border-border rounded px-2 py-1 text-sm outline-none w-full transition-colors focus:border-ring" />
            </NumberField.Group>
          </NumberField.Root>
        </div>
      )}
    </div>
  );
}
