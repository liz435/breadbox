import { Label } from "@/components/ui/label"
import { useScene } from "../store/scene-context"
import { TILE_TYPES } from "../types"

export function TileBrushPalette() {
  const { state, send } = useScene()

  if (!state.tilemap) return null

  return (
    <div>
      <Label>Brush</Label>
      <div className="flex flex-wrap gap-1 mt-1">
        {TILE_TYPES.map((tile) => (
          <button
            key={tile.id}
            className={`w-8 h-8 rounded cursor-pointer border-2 transition-colors ${
              state.activeBrush === tile.id
                ? "border-ring ring-1 ring-ring"
                : "border-transparent hover:border-border"
            }`}
            style={{ backgroundColor: tile.color }}
            title={tile.name}
            onClick={() => send({ type: "SET_BRUSH", brush: tile.id })}
          />
        ))}
      </div>
    </div>
  )
}
