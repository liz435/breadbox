// ── Wire-obstacle debug overlay ──────────────────────────────────────────────
//
// Draws the volumes the wire router arcs over (see part-obstacles / part-volume)
// so you can verify them by eye: a cyan wireframe box for each GLB part's
// oriented bounding box (OBB), an amber cylinder for parts still on the disc
// fallback (GLB not loaded yet). The OBB is derived from the model bounds + the
// pin-calibration fit — it isn't hand-tuned, so there's nothing to calibrate
// here. If a box doesn't hug its model, fix the part's pin calibration (or its
// heightMm); if a jumper passes *through* a box instead of over it, that's a
// routing miss to report.

import { useMemo } from "react"
import { useSyncExternalStore } from "react"
import { useBoardSelector } from "@/store/board-context"
import { BOARD_SURFACE_Y } from "./layout"
import { partObstacles, type PartObstacle } from "./part-obstacles"
import { usePinCalibrations } from "./component-pin-calibration"
import { useBoundsVersion } from "./part-volume"
import { useAssemblyObstacles } from "./assembly-obstacles"

// ── Toggle store (localStorage-backed, mirrors the calibration mode flags) ────

const KEY = "dreamer:obstacle-debug"
let on = typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1"
const listeners = new Set<() => void>()

export function isObstacleDebug(): boolean {
  return on
}

export function setObstacleDebug(next: boolean): void {
  on = next
  try {
    localStorage.setItem(KEY, next ? "1" : "0")
  } catch {
    // ignore
  }
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useObstacleDebug(): boolean {
  return useSyncExternalStore(subscribe, isObstacleDebug, isObstacleDebug)
}

// ── Overlay ──────────────────────────────────────────────────────────────────

/** One obstacle as a see-through wireframe: box for an OBB, cylinder for a disc.
 *  Both span from the board surface up to the obstacle's top. */
function ObstacleShape({ o }: { o: PartObstacle }) {
  if (o.kind === "obb") {
    const { cx, cz, ux, uz, vx, vz, topY } = o.obb
    const hu = Math.hypot(ux, uz)
    const hv = Math.hypot(vx, vz)
    const height = Math.max(0.1, topY - BOARD_SURFACE_Y)
    // Align the box's local +X onto the OBB's u half-axis (three rotates +X to
    // (cosθ,0,−sinθ), so θ = −atan2(uz,ux)); +Z then lands on the ⟂ v-axis.
    const yaw = -Math.atan2(uz, ux)
    return (
      <mesh position={[cx, BOARD_SURFACE_Y + height / 2, cz]} rotation={[0, yaw, 0]}>
        <boxGeometry args={[2 * hu, height, 2 * hv]} />
        <meshBasicMaterial color="#22d3ee" wireframe transparent opacity={0.85} depthTest={false} />
      </mesh>
    )
  }
  const height = Math.max(0.1, o.topY - BOARD_SURFACE_Y)
  return (
    <mesh position={[o.x, BOARD_SURFACE_Y + height / 2, o.z]}>
      <cylinderGeometry args={[o.radius, o.radius, height, 20, 1, true]} />
      <meshBasicMaterial color="#f59e0b" wireframe transparent opacity={0.6} depthTest={false} />
    </mesh>
  )
}

/** Renders every wire obstacle for the current board. Toggle with the toolbar. */
export function ObstacleDebug() {
  const components = useBoardSelector((ctx) => ctx.components)
  const pinCals = usePinCalibrations()
  const uploadedObstacles = useAssemblyObstacles()
  const boundsVersion = useBoundsVersion()
  const obstacles = useMemo(
    () => [...partObstacles(components, pinCals), ...uploadedObstacles],
    [components, pinCals, boundsVersion, uploadedObstacles],
  )
  return (
    <group name="obstacle-debug">
      {obstacles.map((o, i) => (
        <ObstacleShape key={i} o={o} />
      ))}
    </group>
  )
}
