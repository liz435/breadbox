// ── 3D Components panel ──────────────────────────────────────────────────────
//
// Replaces the 2D placement palette inside the Components tab while the 3D
// Breadboard tab is front. The palette's click-to-place arms the 2D canvas
// interaction machine, which is invisible from the 3D view — so here the
// sidebar shows what IS actionable in 3D: the parts already in the scene
// (select / remove), the scene manager (uploaded models, mounting, joints,
// bindings — AssemblyPanel), and scene-level actions (physics, calibration,
// model import/export). Loaded lazily from project-panel so the three.js
// dependencies stay out of the main bundle.

import { useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { isBoardComponentType } from "@dreamer/schemas"
import { Box, Download, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react"
import { toast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { useBoard } from "@/store/board-context"
import { useComponentCatalog } from "@/components/catalog/use-component-catalog"
import { AssemblyPanel } from "./assembly-panel"
import { downloadSceneGlb } from "./scene-export"
import { setPendingModelFile } from "./pending-model-import"
import { setPhysicsEnabled, usePhysicsEnabled } from "./physics-flag"
import {
  setBreadboardCalibrating,
  useBreadboardCalibrating,
} from "./breadboard-calibration"
import {
  setPinCalibrating,
  usePinCalibrationMode,
} from "./component-pin-calibration"
import {
  setCalibrating as setArduinoCalibrating,
  useCalibrating as useArduinoCalibrating,
} from "./arduino-calibration"
import { setObstacleDebug, useObstacleDebug } from "./obstacle-debug"
import { GLB_PARTS } from "./glb-parts"
import {
  resetSceneTuner,
  setSceneTuner,
  useSceneTuner,
  type SceneTunerState,
} from "./scene-tuner"

const FIRST_GLB_TYPE = Object.keys(GLB_PARTS).sort()[0] ?? null

function SectionHeading({ children }: { children: string }) {
  return (
    <h3 className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  )
}

function ToggleRow({
  on,
  onClick,
  label,
  title,
}: {
  on: boolean
  onClick: () => void
  label: string
  title: string
}) {
  return (
    <Button
      size="sm"
      variant={on ? "default" : "secondary"}
      className="w-full justify-start"
      onClick={onClick}
      title={title}
    >
      {label}
    </Button>
  )
}

function PartRow({
  icon,
  label,
  detail,
  isSelected,
  onSelect,
  onRemove,
}: {
  icon: ReactNode
  label: string
  detail: string
  isSelected: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  return (
    <div className="group flex items-center gap-0.5">
      <button
        type="button"
        onClick={onSelect}
        className={
          isSelected
            ? "flex min-w-0 flex-1 items-center gap-2 rounded-md bg-accent px-2 py-1.5 text-left text-xs text-foreground"
            : "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground/90 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
        }
      >
        <span className="flex-shrink-0">{icon}</span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{label}</span>
          <span className="truncate text-[10px] text-muted-foreground">{detail}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        title="Remove part"
        className="flex-shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  )
}

function TunerColor({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex items-center justify-between gap-2 px-1 py-1">
      <span className="text-[11px] text-foreground/80">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
        />
        <code className="w-[4.5rem] text-right text-[10px] text-muted-foreground">{value}</code>
      </span>
    </label>
  )
}

function TunerRange({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block px-1 py-1">
      <span className="mb-0.5 flex items-center justify-between text-[11px] text-foreground/80">
        <span>{label}</span>
        <code className="text-[10px] text-muted-foreground">{value.toFixed(2)}</code>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-4 w-full accent-primary"
      />
    </label>
  )
}

function SceneTuner() {
  const tuner = useSceneTuner()
  const update = <K extends keyof SceneTunerState>(key: K) => (value: SceneTunerState[K]) =>
    setSceneTuner(key, value)

  return (
    <details open className="rounded-md border border-border bg-background/40">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal className="size-3.5 text-muted-foreground" />
        Lighting tuner
      </summary>
      <div className="border-t border-border px-1.5 py-1.5">
        <TunerColor label="Background" value={tuner.backgroundColor} onChange={update("backgroundColor")} />
        <TunerRange label="Exposure" value={tuner.exposure} min={0.5} max={1.5} step={0.05} onChange={update("exposure")} />

        <div className="mt-1 border-t border-border pt-1">
          <TunerColor label="Sky light" value={tuner.hemisphereSkyColor} onChange={update("hemisphereSkyColor")} />
          <TunerColor label="Ground light" value={tuner.hemisphereGroundColor} onChange={update("hemisphereGroundColor")} />
          <TunerRange label="Ambient intensity" value={tuner.hemisphereIntensity} min={0} max={1.5} step={0.05} onChange={update("hemisphereIntensity")} />
        </div>

        <div className="mt-1 border-t border-border pt-1">
          <TunerColor label="Top light" value={tuner.topLightColor} onChange={update("topLightColor")} />
          <TunerRange label="Top intensity" value={tuner.topLightIntensity} min={0} max={4} step={0.05} onChange={update("topLightIntensity")} />
          <TunerColor label="Warm light" value={tuner.warmLightColor} onChange={update("warmLightColor")} />
          <TunerRange label="Warm intensity" value={tuner.warmLightIntensity} min={0} max={2} step={0.05} onChange={update("warmLightIntensity")} />
          <TunerColor label="Orange light" value={tuner.orangeLightColor} onChange={update("orangeLightColor")} />
          <TunerRange label="Orange intensity" value={tuner.orangeLightIntensity} min={0} max={2} step={0.05} onChange={update("orangeLightIntensity")} />
        </div>

        <Button
          size="sm"
          variant="secondary"
          className="mt-1.5 w-full justify-start"
          onClick={resetSceneTuner}
          title="Reset the 3D lighting tuner"
        >
          <RotateCcw className="mr-1.5 size-3.5" />
          Reset lighting
        </Button>
      </div>
    </details>
  )
}

export function Components3dPanel() {
  const { state, send } = useBoard()
  const catalog = useComponentCatalog()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const physicsEnabled = usePhysicsEnabled()
  const calibrating = useBreadboardCalibrating()
  const pinMode = usePinCalibrationMode()
  const arduinoCalibrating = useArduinoCalibrating()
  const obstacleDebug = useObstacleDebug()

  const defsByType = useMemo(
    () => new Map(catalog.map((def) => [def.type, def])),
    [catalog],
  )

  const parts = useMemo(
    () =>
      Object.values(state.components).sort(
        (a, b) => a.y - b.y || a.x - b.x,
      ),
    [state.components],
  )
  const wireCount = Object.keys(state.wires).length

  async function handleExport() {
    setExporting(true)
    try {
      const { savedTo, cancelled } = await downloadSceneGlb("breadboard-assembly.glb")
      if (!cancelled) {
        toast.success(
          savedTo ? `Saved to ${savedTo}` : "Exported breadboard-assembly.glb to your downloads",
        )
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? `Export failed: ${error.message}` : "Export failed",
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-card">
        <div className="border-b border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          3D view — parts are placed from the 2D Breadboard tab
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          <div>
            <SectionHeading>Parts in scene</SectionHeading>
            {parts.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                No parts yet — switch to the 2D tab to place some.
              </p>
            )}
            {parts.map((part) => {
              const def = defsByType.get(part.type)
              const isBoard = isBoardComponentType(part.type)
              return (
                <PartRow
                  key={part.id}
                  icon={def?.paletteIcon ?? <Box className="size-5" />}
                  label={def?.label ?? part.type.replace(/_/g, " ")}
                  detail={isBoard ? "board" : `row ${part.y} · col ${part.x}`}
                  isSelected={state.selectedId === part.id}
                  onSelect={() => send({ type: "SELECT", id: part.id })}
                  onRemove={() => send({ type: "REMOVE_COMPONENT", id: part.id })}
                />
              )
            })}
            {wireCount > 0 && (
              <p className="mt-1 px-2 text-[10px] text-muted-foreground">
                {wireCount} wire{wireCount === 1 ? "" : "s"}
              </p>
            )}
          </div>

          <div className="mt-4">
            <AssemblyPanel onImport={() => fileInputRef.current?.click()} />
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <SectionHeading>Scene</SectionHeading>
            <ToggleRow
              on={physicsEnabled}
              onClick={() => setPhysicsEnabled(!physicsEnabled)}
              label={physicsEnabled ? "Physics: On" : "Physics: Off"}
              title="Toggle Rapier physics: parts drop, settle, and can be dragged; wires drape and can be grabbed to reshape — double-click a wire to reset (experimental)"
            />
            <Button
              size="sm"
              variant="secondary"
              className="w-full justify-start"
              onClick={handleExport}
              disabled={exporting}
              title="Download the whole assembly as a .glb (e.g. to check fit in a slicer)"
            >
              <Download className="mr-1.5 size-3.5" />
              {exporting ? "Exporting…" : "Export .glb"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".glb,.gltf,.stl"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) setPendingModelFile(file)
                e.target.value = ""
              }}
            />
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <SectionHeading>Calibration & debug</SectionHeading>
            <ToggleRow
              on={calibrating}
              onClick={() => setBreadboardCalibrating(!calibrating)}
              label={calibrating ? "Calibrating grid…" : "Calibrate grid"}
              title="Drag the anchor handles onto the model's holes to warp the grid + wires onto it"
            />
            <ToggleRow
              on={pinMode.on}
              onClick={() => setPinCalibrating(!pinMode.on, pinMode.type ?? FIRST_GLB_TYPE)}
              label={pinMode.on ? "Calibrating pins…" : "Calibrate pins"}
              title="Drag anchors onto a part model's pins so it's sized + seated by its pin spacing"
            />
            <ToggleRow
              on={arduinoCalibrating}
              onClick={() => setArduinoCalibrating(!arduinoCalibrating)}
              label={arduinoCalibrating ? "Calibrating Arduino…" : "Calibrate Arduino"}
              title="Drag a handle onto each Arduino header pin to align wire attach points with the 3D model"
            />
            <ToggleRow
              on={obstacleDebug}
              onClick={() => setObstacleDebug(!obstacleDebug)}
              label={obstacleDebug ? "Hitboxes: On" : "Show hitboxes"}
              title="Show the wire-routing hitboxes: cyan = a part's oriented bounding box (OBB), amber = disc fallback. Wires should drape over them, not through them."
            />
          </div>
      </div>
    </div>
  )
}
