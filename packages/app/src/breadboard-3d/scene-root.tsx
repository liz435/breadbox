// ── 3D breadboard scene ─────────────────────────────────────────────────────
//
// Renders the live board state (same source the 2D canvas uses) as a 3D scene
// in real-world millimeters. `frameloop="demand"` keeps the GPU idle unless
// the camera moves or React updates the scene; the signal-driven animation
// loop requests frames explicitly while the simulator runs.

import { Suspense } from "react"
import { Canvas } from "@react-three/fiber"
import { CameraControls } from "@react-three/drei"
import { isBoardComponentType } from "@dreamer/schemas"
import { useBoardSelector } from "@/store/board-context"
import { PartMesh } from "./part-models"
import { UploadedBodies } from "./uploaded-bodies"
import { ARDUINO_RECT_PX, BREADBOARD_RECT_PX, pixelToWorld, pxToMm } from "./layout"

const PCB_THICKNESS_MM = 1.6
const BREADBOARD_THICKNESS_MM = 8.5

/** Static surfaces: the Arduino PCB and the breadboard block. */
function BoardSurfaces() {
  const arduinoCenter = pixelToWorld(
    ARDUINO_RECT_PX.x + ARDUINO_RECT_PX.width / 2,
    ARDUINO_RECT_PX.y + ARDUINO_RECT_PX.height / 2,
  )
  const breadboardCenter = pixelToWorld(
    BREADBOARD_RECT_PX.x + BREADBOARD_RECT_PX.width / 2,
    BREADBOARD_RECT_PX.y + BREADBOARD_RECT_PX.height / 2,
  )
  return (
    <group>
      {/* Arduino Uno PCB */}
      <group position={[arduinoCenter.x, 0, arduinoCenter.z]}>
        <mesh position={[0, PCB_THICKNESS_MM / 2, 0]}>
          <boxGeometry
            args={[pxToMm(ARDUINO_RECT_PX.width), PCB_THICKNESS_MM, pxToMm(ARDUINO_RECT_PX.height)]}
          />
          <meshStandardMaterial color="#00695c" roughness={0.7} />
        </mesh>
        {/* USB jack, roughly where the 2D art puts it (top-left corner) */}
        <mesh
          position={[
            -pxToMm(ARDUINO_RECT_PX.width) / 2 + 6,
            PCB_THICKNESS_MM + 5,
            -pxToMm(ARDUINO_RECT_PX.height) / 2 + 9,
          ]}
        >
          <boxGeometry args={[12, 10, 11]} />
          <meshStandardMaterial color="#b0bec5" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* header strips along the long edges */}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[
              2,
              PCB_THICKNESS_MM + 4,
              side * (pxToMm(ARDUINO_RECT_PX.height) / 2 - 4),
            ]}
          >
            <boxGeometry args={[pxToMm(ARDUINO_RECT_PX.width) * 0.6, 8, 2.5]} />
            <meshStandardMaterial color="#212121" roughness={0.6} />
          </mesh>
        ))}
      </group>

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
    </group>
  )
}

/** All placed discrete parts (surface/MCU boards are drawn by BoardSurfaces). */
function Parts() {
  const components = useBoardSelector((ctx) => ctx.components)
  return (
    <group>
      {Object.values(components)
        .filter((component) => !isBoardComponentType(component.type))
        .map((component) => (
          <PartMesh key={component.id} component={component} />
        ))}
    </group>
  )
}

export function SceneRoot() {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [40, 140, 160], fov: 40, near: 1, far: 3000 }}
    >
      <color attach="background" args={["#e7e5e4"]} />
      <hemisphereLight args={["#ffffff", "#8d8478"]} intensity={0.9} />
      <directionalLight position={[80, 180, 100]} intensity={1.6} />
      <directionalLight position={[-120, 80, -60]} intensity={0.4} />
      <BoardSurfaces />
      <Parts />
      {/* Model files load over Suspense; the rest of the scene stays visible. */}
      <Suspense fallback={null}>
        <UploadedBodies />
      </Suspense>
      <CameraControls makeDefault />
    </Canvas>
  )
}
