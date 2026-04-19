// ── OLED Display Panel ─────────────────────────────────────────────────────
//
// Dedicated dock panel that mirrors any SSD1306 framebuffer at large size
// (4× upscale by default). When multiple OLEDs are present, a segmented
// button row at the top selects which one to view.

import { useMemo, useState } from "react"
import { useBoard } from "@/store/board-context"
import { OledCanvas } from "@/components/oled-canvas"
import { cn } from "@/utils/classnames"

export function OledDisplayPanel() {
  const { state } = useBoard()
  const oledMap = state.libraryState.oled

  // componentId → component name for the selector chip.
  const oledIds = useMemo(() => Object.keys(oledMap).sort(), [oledMap])
  const namesById = useMemo(() => {
    const out: Record<string, string> = {}
    for (const id of oledIds) {
      out[id] = state.components[id]?.name ?? id.slice(0, 8)
    }
    return out
  }, [oledIds, state.components])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Auto-select the first OLED when one appears, or when the selected one disappears.
  const effectiveSelected = selectedId && oledMap[selectedId] ? selectedId : (oledIds[0] ?? null)

  const selected = effectiveSelected ? oledMap[effectiveSelected] : null

  if (oledIds.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950 p-6">
        <p className="max-w-md text-center text-sm text-zinc-500">
          No OLED display detected. Add an SSD1306 component to the breadboard
          and run a sketch that uses Adafruit_SSD1306.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col bg-zinc-950">
      {oledIds.length > 1 && (
        <div className="flex shrink-0 gap-1 border-b border-zinc-800 px-3 py-2">
          {oledIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSelectedId(id)}
              className={cn(
                "rounded-md px-2.5 py-1 font-mono text-xs transition-colors",
                effectiveSelected === id
                  ? "bg-cyan-900/50 text-cyan-300 ring-1 ring-cyan-700/60"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
              )}
            >
              {namesById[id]}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-1 items-center justify-center overflow-hidden p-4">
        <div className="rounded-md border border-zinc-800 bg-black p-4 shadow-inner">
          <OledCanvas state={selected} cssWidth={512} cssHeight={256} />
        </div>
      </div>
      {selected && (
        <div className="shrink-0 border-t border-zinc-800 px-3 py-1.5 font-mono text-[10px] text-zinc-500">
          {selected.width}×{selected.height} • {selected.on ? "ON" : "OFF"}
          {selected.inverted ? " • INVERTED" : ""}
        </div>
      )}
    </div>
  )
}
