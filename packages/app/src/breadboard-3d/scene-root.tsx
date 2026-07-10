// ── 3D breadboard scene ─────────────────────────────────────────────────────
//
// Renders the live board state (same source the 2D canvas uses) as a 3D scene
// in real-world millimeters. `frameloop="demand"` keeps the GPU idle unless
// the camera moves or React updates the scene; the signal-driven animation
// loop requests frames explicitly while the simulator runs.

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { CameraControls, ContactShadows, Environment, Lightformer, RoundedBox, useGLTF } from "@react-three/drei"
import { Box3, Matrix4, Vector3 } from "three"
import type { Group, InstancedMesh } from "three"
import { isBoardComponentType } from "@dreamer/schemas"
import { useBoardSelector } from "@/store/board-context"
import { gridToPixel, isPositiveRailCol, isRailRow, ROWS } from "@/breadboard/breadboard-grid"
import { PartMesh } from "./part-models"
import { UploadedBodies } from "./uploaded-bodies"
import { TransformGizmo } from "./transform-gizmo"
import { AnimationDriver } from "./animation-driver"
import { Wires } from "./wires"
import { PhysicsScene } from "./physics-scene"
import { PhysicsErrorBoundary } from "./physics-boundary"
import { usePhysicsEnabled } from "./physics-flag"
import { usePhysicsActive } from "./physics-activity"
import { PostEffects } from "./post-effects"
import { Scene3dLoading } from "./scene-loading"
import { registerExportScene } from "./scene-export"
import { useEditor } from "./editor-state"
import {
  boardOffset,
  offsetToWorld,
  partBoardOffset,
  surfaceBoardsOf,
} from "./board-offsets"
import {
  ARDUINO_RECT_PX,
  BREADBOARD_RECT_PX,
  BREADBOARD_THICKNESS_MM,
  PCB_THICKNESS_MM,
  pixelToWorld,
  pxToMm,
  type WorldPoint,
} from "./layout"
import { useBreadboardCalibrating, useBreadboardTransform } from "./breadboard-calibration"
import { useGridCalibration, warpedGridXZ } from "./breadboard-grid-calibration"
import { BreadboardGridCalibrator } from "./breadboard-grid-calibrator"
import { usePinCalibrationMode } from "./component-pin-calibration"
import { ComponentPinCalibrator } from "./component-pin-calibrator"
import arduinoUnoUrl from "@/assets/arduino-uno.glb?url"
import breadboardUrl from "@/assets/breadboard.glb?url"

/** All hole columns of the clickable grid: terminal cols 0–9 + rail cols. */
const HOLE_COLS = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

/** One instanced draw call for the breadboard's hole cutouts. Positions come
 *  from the live grid warp so the holes follow the calibrated model sockets. */
function BreadboardHoles() {
  const meshRef = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)
  // Re-place every instance when an anchor (or the height) moves.
  const calibration = useGridCalibration()
  const positions = useMemo(() => {
    const list: { x: number; y: number; z: number }[] = []
    for (let row = 0; row < ROWS; row++) {
      for (const col of HOLE_COLS) {
        // Power rails only carry holes inside their 5-hole blocks.
        const isRail = col < 0 || col > 9
        if (isRail && !isRailRow(row)) continue
        list.push(warpedGridXZ(row, col))
      }
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calibration])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const matrix = new Matrix4()
    positions.forEach((point, index) => {
      matrix.setPosition(point.x, point.y, point.z)
      mesh.setMatrixAt(index, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    invalidate()
  }, [positions, invalidate])

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
    // Each stripe sits just outside its hole column; colour follows polarity
    // (isPositiveRailCol): + rails red, − rails blue. dx nudges the stripe onto
    // the board-edge side of its column so the pair doesn't overlap.
    const cols: { col: number; dx: number }[] = [
      { col: -2, dx: -2.2 },
      { col: -1, dx: 2.2 },
      { col: 10, dx: -2.2 },
      { col: 11, dx: 2.2 },
    ]
    const entries = cols.map(({ col, dx }) => ({
      x: pixelToWorld(gridToPixel({ row: 0, col }).x, 0).x + dx,
      color: isPositiveRailCol(col) ? "#c62828" : "#1565c0",
    }))
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

/** Fallback Arduino: a procedural PCB with its major landmarks (headers, MCU,
 *  jacks, crystal). Shown while the GLB model streams in, or if it fails. */
function ArduinoBoardFallback() {
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

// ── Arduino GLB placement tuning ─────────────────────────────────────────────
// The wire endpoints are fixed to the schematic pinout (digital header on the
// top long edge, power/analog on the bottom — see breadboard-grid.ts). The
// auto-fit below lands the model on the right footprint but can't know which of
// its edges/faces is "digital" or how tall its headers sit, so these knobs
// orient + seat it. All are applied on top of the auto-fit.
//
//  - YAW_TURNS   extra 90° turns about vertical (0..3) to pick the long-edge
//                orientation that puts digital pins on the top edge.
//  - FLIP        add a 180° turn (swap the two long edges) if digital/analog
//                land on the wrong sides.
//  - NUDGE       fine shift in the board plane (mm): +x right, +z toward viewer.
//  - LIFT_Y      raise/lower so the header sockets meet the wire ends (mm).
//  - SCALE       multiplier on the fitted scale (1 = fill the footprint).
const ARDUINO_MODEL = {
  yawTurns: 0,
  flip: false,
  nudge: { x: 0, z: 0 },
  liftY: 0,
  scale: 1,
}

/** The imported Arduino Uno GLB, auto-fitted to the board's footprint.
 *
 *  The model's native units/orientation are unknown, so everything is derived
 *  at runtime from its measured bounding box: lay the thinnest axis (the PCB
 *  normal) vertical, align its long side with the Arduino footprint's long
 *  side, uniform-scale to fit, then recentre over the Arduino rect and rest the
 *  bottom on the floor. `ARDUINO_MODEL` above applies orientation/seat tweaks
 *  on top so the header rows line up with the fixed wire attach points. */
function ArduinoModel() {
  const { scene } = useGLTF(arduinoUnoUrl)
  // Clone so this instance owns its graph (useGLTF caches the source scene).
  const model = useMemo(() => scene.clone(true), [scene])
  const groupRef = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)

  const center = pixelToWorld(
    ARDUINO_RECT_PX.x + ARDUINO_RECT_PX.width / 2,
    ARDUINO_RECT_PX.y + ARDUINO_RECT_PX.height / 2,
  )
  const targetW = pxToMm(ARDUINO_RECT_PX.width)
  const targetD = pxToMm(ARDUINO_RECT_PX.height)

  useLayoutEffect(() => {
    const group = groupRef.current
    if (!group) return
    group.position.set(0, 0, 0)
    group.rotation.set(0, 0, 0)
    group.scale.setScalar(1)
    group.updateWorldMatrix(true, true)

    const size = new Vector3()
    const measure = () => new Box3().setFromObject(group).getSize(size)

    // 1. Lay the board flat — rotate its thinnest axis (the PCB normal) to +Y.
    measure()
    const min = Math.min(size.x, size.y, size.z)
    if (size.x === min) group.rotation.z = -Math.PI / 2
    else if (size.z === min) group.rotation.x = -Math.PI / 2
    group.updateWorldMatrix(true, true)

    // 2. Align the model's long side with the footprint's long side, then apply
    //    the manual orientation tweaks (which long edge is "digital", flips).
    measure()
    if (size.x >= size.z !== targetW >= targetD) group.rotation.y += Math.PI / 2
    group.rotation.y += ARDUINO_MODEL.yawTurns * (Math.PI / 2)
    if (ARDUINO_MODEL.flip) group.rotation.y += Math.PI
    group.updateWorldMatrix(true, true)
    measure()

    // 3. Uniform-scale the footprint to fit (preserve aspect ratio).
    group.scale.setScalar(Math.min(targetW / size.x, targetD / size.z) * ARDUINO_MODEL.scale)
    group.updateWorldMatrix(true, true)

    // 4. Recentre over the Arduino rect, rest the bottom on the floor, then nudge.
    const box = new Box3().setFromObject(group)
    const centroid = box.getCenter(new Vector3())
    group.position.x += center.x - centroid.x + ARDUINO_MODEL.nudge.x
    group.position.z += center.z - centroid.z + ARDUINO_MODEL.nudge.z
    group.position.y += -box.min.y + ARDUINO_MODEL.liftY
    group.updateWorldMatrix(true, true)

    // frameloop="demand" — nudge a repaint now that the transform is set.
    invalidate()
  }, [model, center.x, center.z, targetW, targetD, invalidate])

  return (
    <group ref={groupRef}>
      <primitive object={model} />
    </group>
  )
}

useGLTF.preload(arduinoUnoUrl)

/** Fallback breadboard: a procedural rounded body with a recessed centre
 *  channel. Shown while the GLB model streams in, or if it fails to load. */
function BreadboardBodyFallback() {
  return (
    <>
      <RoundedBox
        args={[
          pxToMm(BREADBOARD_RECT_PX.width),
          BREADBOARD_THICKNESS_MM,
          pxToMm(BREADBOARD_RECT_PX.height),
        ]}
        radius={1.6}
        smoothness={4}
        position={[0, BREADBOARD_THICKNESS_MM / 2, 0]}
      >
        <meshStandardMaterial color="#e4dccb" roughness={0.62} metalness={0.02} />
      </RoundedBox>
      {/* recessed valley between the two terminal banks (real DIP channel) */}
      <mesh position={[0, BREADBOARD_THICKNESS_MM - 0.9, 0]}>
        <boxGeometry args={[pxToMm(12), 1.8, pxToMm(BREADBOARD_RECT_PX.height) * 0.94]} />
        <meshStandardMaterial color="#b8b1a0" roughness={0.8} />
      </mesh>
    </>
  )
}

/** The imported breadboard GLB, auto-fitted to the footprint (same measured-bbox
 *  approach as the Arduino: thinnest axis up, long-side aligned, uniform-scaled,
 *  seated on the floor). The baked `useBreadboardTransform` placement (offset,
 *  height, yaw, scale) is layered on top — the fit runs in the inner group, the
 *  offset/lift on the outer group. Hole alignment is handled by the grid warp,
 *  not by moving the model. */
function BreadboardModel({ center }: { center: WorldPoint }) {
  const { scene } = useGLTF(breadboardUrl)
  // Clone so this instance owns its graph (useGLTF caches the source scene).
  const model = useMemo(() => scene.clone(true), [scene])
  const fitRef = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  const cal = useBreadboardTransform()

  const targetW = pxToMm(BREADBOARD_RECT_PX.width)
  const targetD = pxToMm(BREADBOARD_RECT_PX.height)

  useLayoutEffect(() => {
    const group = fitRef.current
    if (!group) return
    group.position.set(0, 0, 0)
    group.rotation.set(0, 0, 0)
    group.scale.setScalar(1)
    group.updateWorldMatrix(true, true)

    const size = new Vector3()
    const measure = () => new Box3().setFromObject(group).getSize(size)

    // 1. Lay the board flat — rotate its thinnest axis (the PCB normal) to +Y.
    measure()
    const min = Math.min(size.x, size.y, size.z)
    if (size.x === min) group.rotation.z = -Math.PI / 2
    else if (size.z === min) group.rotation.x = -Math.PI / 2
    group.updateWorldMatrix(true, true)

    // 2. Align the long side with the footprint, then apply the calibrated yaw.
    measure()
    if (size.x >= size.z !== targetW >= targetD) group.rotation.y += Math.PI / 2
    group.rotation.y += cal.yaw
    group.updateWorldMatrix(true, true)
    measure()

    // 3. Uniform-scale to fill the footprint, times the calibrated scale.
    group.scale.setScalar(Math.min(targetW / size.x, targetD / size.z) * cal.scale)
    group.updateWorldMatrix(true, true)

    // 4. Recentre over the breadboard rect and rest the bottom on the floor.
    //    The calibrated in-plane offset + lift are applied by the outer group.
    const box = new Box3().setFromObject(group)
    const centroid = box.getCenter(new Vector3())
    group.position.x += center.x - centroid.x
    group.position.z += center.z - centroid.z
    group.position.y += -box.min.y
    group.updateWorldMatrix(true, true)
    invalidate()
  }, [model, center.x, center.z, targetW, targetD, cal.yaw, cal.scale, invalidate])

  return (
    <group position={[cal.x, cal.y, cal.z]}>
      <group ref={fitRef}>
        <primitive object={model} />
      </group>
    </group>
  )
}

useGLTF.preload(breadboardUrl)

/** One breadboard: the GLB model (procedural body as the streaming fallback),
 *  its hole grid and rail stripes. The interior geometry is authored at the
 *  origin board's position; the wrapping group shifts the whole board to its
 *  world offset so a second or moved board lands where the 2D canvas puts it. */
function BreadboardBlock({ offset }: { offset: WorldPoint }) {
  const breadboardCenter = pixelToWorld(
    BREADBOARD_RECT_PX.x + BREADBOARD_RECT_PX.width / 2,
    BREADBOARD_RECT_PX.y + BREADBOARD_RECT_PX.height / 2,
  )
  return (
    <group position={[offset.x, 0, offset.z]}>
      <group position={[breadboardCenter.x, 0, breadboardCenter.z]}>
        <Suspense fallback={<BreadboardBodyFallback />}>
          <BreadboardModel center={{ x: 0, z: 0 }} />
        </Suspense>
      </group>

      {/* hole grid + rail stripes live in world space (same px→mm mapping) */}
      <BreadboardHoles />
      <RailStripes />
    </group>
  )
}

/** Static surfaces: the Arduino PCB and every placed breadboard. Reads the live
 *  board state so multiple (and moved) breadboards each render at their own
 *  world position, matching the 2D canvas. */
function BoardSurfaces() {
  const components = useBoardSelector((ctx) => ctx.components)
  const boards = useMemo(() => {
    const surfaces = surfaceBoardsOf(components)
    // Legacy/empty scenes carry no explicit surface board — keep the single
    // origin breadboard so the 3D view is never an empty floor.
    if (surfaces.length === 0) return [{ id: "default", offset: { x: 0, z: 0 } as WorldPoint }]
    return surfaces.map((board) => ({ id: board.id, offset: offsetToWorld(boardOffset(board)) }))
  }, [components])

  return (
    <group name="board-3d">
      <Suspense fallback={<ArduinoBoardFallback />}>
        <ArduinoModel />
      </Suspense>
      {boards.map((board) => (
        <BreadboardBlock key={board.id} offset={board.offset} />
      ))}
    </group>
  )
}

/** Hands the live three.js scene to the DOM export button (outside the Canvas). */
function ExportBridge() {
  const scene = useThree((state) => state.scene)
  useEffect(() => registerExportScene(scene), [scene])
  return null
}

/** All placed discrete parts (surface/MCU boards are drawn by BoardSurfaces).
 *  Each part is shifted onto its parent board, so parts on a second or moved
 *  breadboard sit on that board instead of collapsing onto the first. */
function Parts() {
  const components = useBoardSelector((ctx) => ctx.components)
  const surfaceBoards = useMemo(() => surfaceBoardsOf(components), [components])
  return (
    <group name="parts-3d">
      {Object.values(components)
        .filter((component) => !isBoardComponentType(component.type))
        .map((component) => (
          <PartMesh
            key={component.id}
            component={component}
            boardOffset={offsetToWorld(partBoardOffset(component, surfaceBoards))}
          />
        ))}
    </group>
  )
}

/** Fires `onReady` once, on the first frame the scene actually renders. */
function FirstFrameSignal({ onReady }: { onReady: () => void }) {
  const fired = useRef(false)
  useFrame(() => {
    if (fired.current) return
    fired.current = true
    onReady()
  })
  return null
}

export function SceneRoot() {
  const { select } = useEditor()
  const physicsEnabled = usePhysicsEnabled()
  const physicsActive = usePhysicsActive()
  const calibrating = useBreadboardCalibrating()
  const pinCalibrating = usePinCalibrationMode().on
  // Show a spinner over the canvas until the scene paints its first frame, so
  // WebGL init + environment baking doesn't read as a blank panel.
  const [ready, setReady] = useState(false)
  const handleReady = useCallback(() => setReady(true), [])

  // Safety net: never leave the overlay stuck if the frame signal never fires.
  useEffect(() => {
    if (ready) return
    const timer = setTimeout(() => setReady(true), 6000)
    return () => clearTimeout(timer)
  }, [ready])

  return (
    <>
      <Canvas
        // Idle at frameloop="demand" (GPU sleeps until the camera or React
        // nudges a frame). While physics is awake — a body settling, a drag, a
        // sim-driven driver moving — switch to "always" so the solver steps
        // every frame; the physics world puts itself back to sleep when it
        // comes to rest (see physics-context), returning the canvas to demand.
        frameloop={physicsActive ? "always" : "demand"}
        // Cap the pixel ratio at 1.5. On a Retina Mac dpr=2 renders 4× the
        // fragments of dpr=1, and the whole post-processing stack pays that
        // every frame while orbiting or simulating — costly in the desktop
        // app's WKWebView. 1.5 keeps edges clean (SMAA smooths the rest) for
        // ~40% fewer fragment ops than 2.
        dpr={[1, 1.5]}
        camera={{ position: [40, 140, 160], fov: 40, near: 1, far: 3000 }}
        gl={{ toneMappingExposure: 1.15 }}
        onPointerMissed={() => select(null)}
      >
        {/* Dark studio backdrop + a floor a touch darker still, so the board
            sits in space and its colours read instead of washing out. */}
        <color attach="background" args={["#232228"]} />
        <fog attach="fog" args={["#232228", 260, 620]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
          <planeGeometry args={[1400, 1400]} />
          <meshStandardMaterial color="#1b1a1f" roughness={1} />
        </mesh>

        <hemisphereLight args={["#ffffff", "#6b6456"]} intensity={0.5} />
        <directionalLight position={[80, 180, 100]} intensity={1.5} />
        <directionalLight position={[-120, 80, -60]} intensity={0.35} />
        {/* Procedural studio lighting — soft key overhead, warm + cool rims —
            for real reflections on the metal/plastic parts. No external fetch. */}
        <Environment resolution={256}>
          <Lightformer intensity={2.2} position={[0, 60, 0]} scale={[120, 120, 1]} rotation={[Math.PI / 2, 0, 0]} />
          <Lightformer intensity={1.1} position={[-70, 25, -40]} scale={[50, 50, 1]} color="#ffd9ad" />
          <Lightformer intensity={0.8} position={[70, 25, 40]} scale={[50, 50, 1]} color="#aecbff" />
        </Environment>

        <BoardSurfaces />
        {/* Physics owns the parts and wires when enabled (drop, drag, drape);
            otherwise they render at their exact grid positions. The visible
            boards above stay grid-driven either way — physics only adds their
            collision surfaces (inside PhysicsScene). */}
        {physicsEnabled ? (
          // Rapier's WASM load suspends and can reject; contain both so a
          // physics failure can't take down the whole 3D view (and with it the
          // toggle that would turn physics back off).
          <PhysicsErrorBoundary>
            <Suspense fallback={null}>
              <PhysicsScene />
            </Suspense>
          </PhysicsErrorBoundary>
        ) : (
          <>
            <Parts />
            <Wires />
          </>
        )}
        {/* Model files load over Suspense; the rest of the scene stays visible.
            UploadedBodies renders the non-dynamic uploaded bodies (dynamic ones
            are owned by PhysicsScene when physics is on). */}
        <Suspense fallback={null}>
          <UploadedBodies />
        </Suspense>

        {/* Soft grounding shadow of the board onto the floor. */}
        <ContactShadows position={[0, 0, 0]} scale={420} resolution={1024} blur={2.6} opacity={0.55} far={80} frames={1} />

        {/* Grid calibration handles: drag onto the model's holes to warp the
            hole grid + wire endpoints (see the toolbar toggle). */}
        {calibrating && <BreadboardGridCalibrator />}
        {pinCalibrating && <ComponentPinCalibrator />}

        <TransformGizmo />
        <AnimationDriver />
        <ExportBridge />
        <PostEffects />
        <FirstFrameSignal onReady={handleReady} />
        <CameraControls makeDefault />
      </Canvas>

      <Scene3dLoading overlay hidden={ready} label="Preparing scene…" />
    </>
  )
}
