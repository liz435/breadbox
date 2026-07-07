// ── 3D breadboard scene ─────────────────────────────────────────────────────
//
// Renders the live board state (same source the 2D canvas uses) as a 3D scene
// in real-world millimeters. `frameloop="demand"` keeps the GPU idle unless
// the camera moves or React updates the scene; the signal-driven animation
// loop requests frames explicitly while the simulator runs.

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { Canvas, useThree } from "@react-three/fiber"
import { CameraControls } from "@react-three/drei"
import { Matrix4 } from "three"
import type { InstancedMesh } from "three"
import { isBoardComponentType } from "@dreamer/schemas"
import { useBoardSelector } from "@/store/board-context"
import { gridToPixel, ROWS } from "@/breadboard/breadboard-grid"
import { PartMesh } from "./part-models"
import { UploadedBodies } from "./uploaded-bodies"
import { TransformGizmo } from "./transform-gizmo"
import { AnimationDriver } from "./animation-driver"
import { Wires } from "./wires"
import { registerExportScene } from "./scene-export"
import { useEditor } from "./editor-state"
import {
  ARDUINO_RECT_PX,
  BREADBOARD_RECT_PX,
  BREADBOARD_THICKNESS_MM,
  PCB_THICKNESS_MM,
  pixelToWorld,
  pxToMm,
  type WorldPoint,
} from "./layout"

/** All hole columns of the clickable grid: terminal cols 0–9 + rail cols. */
const HOLE_COLS = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

/** One instanced draw call for the breadboard's ~420 hole cutouts. */
function BreadboardHoles() {
  const meshRef = useRef<InstancedMesh>(null)
  const positions = useMemo(() => {
    const list: WorldPoint[] = []
    for (let row = 0; row < ROWS; row++) {
      for (const col of HOLE_COLS) {
        const px = gridToPixel({ row, col })
        list.push(pixelToWorld(px.x, px.y))
      }
    }
    return list
  }, [])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const matrix = new Matrix4()
    positions.forEach((point, index) => {
      matrix.setPosition(point.x, BREADBOARD_THICKNESS_MM, point.z)
      mesh.setMatrixAt(index, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [positions])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, positions.length]}>
      <boxGeometry args={[1.7, 1.2, 1.7]} />
      <meshStandardMaterial color="#37342c" roughness={0.9} />
    </instancedMesh>
  )
}

/** Red/blue polarity stripes beside the four power-rail hole columns. */
function RailStripes() {
  const stripes = useMemo(() => {
    const top = gridToPixel({ row: 0, col: -2 })
    const bottom = gridToPixel({ row: ROWS - 1, col: -2 })
    const zStart = pixelToWorld(top.x, top.y).z
    const zEnd = pixelToWorld(bottom.x, bottom.y).z
    const length = Math.abs(zEnd - zStart) + 6
    const zCenter = (zStart + zEnd) / 2
    // Each stripe sits just outside its hole column: + rails red, − rails blue.
    const entries: { x: number; color: string }[] = [
      { x: pixelToWorld(gridToPixel({ row: 0, col: -2 }).x, 0).x - 2.2, color: "#c62828" },
      { x: pixelToWorld(gridToPixel({ row: 0, col: -1 }).x, 0).x + 2.2, color: "#1565c0" },
      { x: pixelToWorld(gridToPixel({ row: 0, col: 10 }).x, 0).x - 2.2, color: "#c62828" },
      { x: pixelToWorld(gridToPixel({ row: 0, col: 11 }).x, 0).x + 2.2, color: "#1565c0" },
    ]
    return { entries, length, zCenter }
  }, [])

  return (
    <group>
      {stripes.entries.map((stripe) => (
        <mesh
          key={stripe.x}
          position={[stripe.x, BREADBOARD_THICKNESS_MM + 0.05, stripes.zCenter]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[1, stripes.length]} />
          <meshStandardMaterial color={stripe.color} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

/** The Arduino PCB with its major landmarks: headers, MCU, jacks, crystal. */
function ArduinoBoard() {
  const center = pixelToWorld(
    ARDUINO_RECT_PX.x + ARDUINO_RECT_PX.width / 2,
    ARDUINO_RECT_PX.y + ARDUINO_RECT_PX.height / 2,
  )
  const width = pxToMm(ARDUINO_RECT_PX.width)
  const depth = pxToMm(ARDUINO_RECT_PX.height)
  return (
    <group position={[center.x, 0, center.z]}>
      {/* PCB */}
      <mesh position={[0, PCB_THICKNESS_MM / 2, 0]}>
        <boxGeometry args={[width, PCB_THICKNESS_MM, depth]} />
        <meshStandardMaterial color="#00695c" roughness={0.7} />
      </mesh>
      {/* USB-B jack, top-left corner like the real board */}
      <mesh position={[-width / 2 + 6, PCB_THICKNESS_MM + 5, -depth / 2 + 9]}>
        <boxGeometry args={[12, 10, 11]} />
        <meshStandardMaterial color="#b0bec5" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* barrel power jack, bottom-left corner */}
      <mesh position={[-width / 2 + 6, PCB_THICKNESS_MM + 5.5, depth / 2 - 7]}>
        <boxGeometry args={[13, 11, 9]} />
        <meshStandardMaterial color="#111111" roughness={0.55} />
      </mesh>
      {/* header sockets along the long edges */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[2, PCB_THICKNESS_MM + 4, side * (depth / 2 - 4)]}>
          <boxGeometry args={[width * 0.6, 8, 2.5]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.6} />
        </mesh>
      ))}
      {/* ATmega328P DIP-28, lower-right quadrant, long axis along x */}
      <mesh position={[width * 0.16, PCB_THICKNESS_MM + 2, depth * 0.18]}>
        <boxGeometry args={[35, 4, 9]} />
        <meshStandardMaterial color="#212121" roughness={0.5} />
      </mesh>
      {/* 16 MHz crystal next to the MCU */}
      <mesh position={[-width * 0.12, PCB_THICKNESS_MM + 2, depth * 0.14]}>
        <boxGeometry args={[11, 3.5, 4.5]} />
        <meshStandardMaterial color="#cfd8dc" metalness={0.7} roughness={0.35} />
      </mesh>
      {/* reset button, near the USB jack */}
      <mesh position={[-width * 0.3, PCB_THICKNESS_MM + 2.2, -depth * 0.28]}>
        <boxGeometry args={[6, 3.5, 6]} />
        <meshStandardMaterial color="#eceff1" roughness={0.5} />
      </mesh>
      {/* electrolytic caps by the power jack */}
      {[-4, 4].map((dx) => (
        <mesh key={dx} position={[-width * 0.28 + dx, PCB_THICKNESS_MM + 3.2, depth * 0.3]}>
          <cylinderGeometry args={[3.2, 3.2, 6.5, 16]} />
          <meshStandardMaterial color="#263238" roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

/** Static surfaces: the Arduino PCB and the breadboard block. */
function BoardSurfaces() {
  const breadboardCenter = pixelToWorld(
    BREADBOARD_RECT_PX.x + BREADBOARD_RECT_PX.width / 2,
    BREADBOARD_RECT_PX.y + BREADBOARD_RECT_PX.height / 2,
  )
  return (
    <group name="board-3d">
      <ArduinoBoard />

      {/* Breadboard block */}
      <group position={[breadboardCenter.x, 0, breadboardCenter.z]}>
        <mesh position={[0, BREADBOARD_THICKNESS_MM / 2, 0]}>
          <boxGeometry
            args={[
              pxToMm(BREADBOARD_RECT_PX.width),
              BREADBOARD_THICKNESS_MM,
              pxToMm(BREADBOARD_RECT_PX.height),
            ]}
          />
          <meshStandardMaterial color="#efebe2" roughness={0.85} />
        </mesh>
        {/* center groove between the two terminal banks */}
        <mesh position={[0, BREADBOARD_THICKNESS_MM + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[pxToMm(28), pxToMm(BREADBOARD_RECT_PX.height) * 0.92]} />
          <meshStandardMaterial color="#d7d2c6" roughness={0.9} />
        </mesh>
      </group>

      {/* hole grid + rail stripes live in world space (same px→mm mapping) */}
      <BreadboardHoles />
      <RailStripes />
    </group>
  )
}

/** Hands the live three.js scene to the DOM export button (outside the Canvas). */
function ExportBridge() {
  const scene = useThree((state) => state.scene)
  useEffect(() => registerExportScene(scene), [scene])
  return null
}

/** All placed discrete parts (surface/MCU boards are drawn by BoardSurfaces). */
function Parts() {
  const components = useBoardSelector((ctx) => ctx.components)
  return (
    <group name="parts-3d">
      {Object.values(components)
        .filter((component) => !isBoardComponentType(component.type))
        .map((component) => (
          <PartMesh key={component.id} component={component} />
        ))}
    </group>
  )
}

export function SceneRoot() {
  const { select } = useEditor()
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [40, 140, 160], fov: 40, near: 1, far: 3000 }}
      onPointerMissed={() => select(null)}
    >
      <color attach="background" args={["#e7e5e4"]} />
      <hemisphereLight args={["#ffffff", "#8d8478"]} intensity={0.9} />
      <directionalLight position={[80, 180, 100]} intensity={1.6} />
      <directionalLight position={[-120, 80, -60]} intensity={0.4} />
      <BoardSurfaces />
      <Parts />
      <Wires />
      {/* Model files load over Suspense; the rest of the scene stays visible. */}
      <Suspense fallback={null}>
        <UploadedBodies />
      </Suspense>
      <TransformGizmo />
      <AnimationDriver />
      <ExportBridge />
      <CameraControls makeDefault />
    </Canvas>
  )
}
