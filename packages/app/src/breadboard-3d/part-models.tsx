// ── 3D part representations ─────────────────────────────────────────────────
//
// Three tiers, best available wins:
//   1. Hand-built primitive models for the parts people bolt to printed
//      mechanisms (servo, motor, LED, …) — dimensioned from datasheets (mm).
//   2. Extruded-SVG bodies for custom DSL parts (they carry raw SVG markup).
//   3. A footprint-sized box for everything else.
//
// Models that can animate register their moving nodes/materials in the scene
// registry (keyed by component id) so the signal loop can drive them without
// React re-renders.

import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import { useThree } from "@react-three/fiber"
import type { Group } from "three"
import { Box3, ExtrudeGeometry, MeshStandardMaterial, Vector3 } from "three"
import { SVGLoader } from "three-stdlib"
import type { BoardComponent, DslBinding } from "@dreamer/schemas"
import { evaluateExpression, isCustomComponentType } from "@dreamer/schemas"
import { getCustomDef, subscribeCustom } from "@/components/catalog/custom-store"
import { getComponentFootprint, gridToPixel } from "@/breadboard/breadboard-grid"
import { useBoardSelector } from "@/store/board-context"
import { BOARD_SURFACE_Y, pixelToWorld, pxToMm, type WorldPoint } from "./layout"
import { registerPartNodes } from "./scene-registry"

/** Extrusion height (mm) for custom-part SVG bodies. */
const SVG_BODY_HEIGHT_MM = 3

// ── Shared placement math ───────────────────────────────────────────────────

function componentFootprint(component: BoardComponent) {
  return getComponentFootprint(
    component.type,
    component.y,
    component.x,
    component.rotation,
    component.properties,
  )
}

/** World-space centroid of the holes a component occupies. */
function footprintCenter(component: BoardComponent): WorldPoint {
  const fp = componentFootprint(component)
  if (fp.points.length === 0) {
    const anchor = gridToPixel({ row: component.y, col: component.x })
    return pixelToWorld(anchor.x, anchor.y)
  }
  let sx = 0
  let sy = 0
  for (const point of fp.points) {
    const px = gridToPixel(point)
    sx += px.x
    sy += px.y
  }
  return pixelToWorld(sx / fp.points.length, sy / fp.points.length)
}

/** Yaw for the component's 90°-step rotation (2D rotates CW; world y-rotation is CCW). */
function rotationYaw(rotation: number): number {
  const steps = ((rotation % 4) + 4) % 4
  return -steps * (Math.PI / 2)
}

// ── Tier 1: hero primitives ─────────────────────────────────────────────────

const LED_COLORS: Record<string, string> = {
  red: "#e53935",
  green: "#43a047",
  blue: "#1e88e5",
  yellow: "#fdd835",
  orange: "#fb8c00",
  white: "#f5f5f5",
}

function LedModel({ component }: { component: BoardComponent }) {
  const color =
    typeof component.properties.color === "string"
      ? (LED_COLORS[component.properties.color] ?? component.properties.color)
      : LED_COLORS.red
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0,
        transparent: true,
        opacity: 0.85,
      }),
    [color],
  )
  useLayoutEffect(
    () => registerPartNodes(component.id, { emissiveMaterial: material }),
    [component.id, material],
  )
  return (
    <group>
      {/* legs */}
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[3.5, 3, 0.5]} />
        <meshStandardMaterial color="#9e9e9e" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* body: 5mm cylinder + dome */}
      <mesh position={[0, 4, 0]} material={material}>
        <cylinderGeometry args={[2.5, 2.5, 2.5, 24]} />
      </mesh>
      <mesh position={[0, 5.25, 0]} material={material}>
        <sphereGeometry args={[2.5, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
    </group>
  )
}

/** SG90-class micro servo: 23×12.2 mm body with the output shaft near one end. */
function ServoModel({ component }: { component: BoardComponent }) {
  const hornRef = useRef<Group>(null)
  useLayoutEffect(() => {
    if (!hornRef.current) return
    return registerPartNodes(component.id, { angleNode: hornRef.current })
  }, [component.id])
  return (
    <group>
      <mesh position={[0, 11, 0]}>
        <boxGeometry args={[23, 22, 12.2]} />
        <meshStandardMaterial color="#1565c0" roughness={0.6} />
      </mesh>
      {/* mounting ears */}
      <mesh position={[0, 16.5, 0]}>
        <boxGeometry args={[32, 2.5, 12.2]} />
        <meshStandardMaterial color="#1565c0" roughness={0.6} />
      </mesh>
      {/* output shaft + horn, offset toward one end like the real gearbox */}
      <group position={[-5.5, 22, 0]}>
        <mesh position={[0, 1, 0]}>
          <cylinderGeometry args={[2.4, 2.4, 2, 20]} />
          <meshStandardMaterial color="#eceff1" roughness={0.5} />
        </mesh>
        <group ref={hornRef} position={[0, 2.2, 0]}>
          <mesh position={[5, 0, 0]}>
            <boxGeometry args={[14, 1.2, 4]} />
            <meshStandardMaterial color="#fafafa" roughness={0.5} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/** 130-size hobby DC motor lying on the board, shaft along +x. */
function DcMotorModel({ component }: { component: BoardComponent }) {
  const shaftRef = useRef<Group>(null)
  useLayoutEffect(() => {
    if (!shaftRef.current) return
    return registerPartNodes(component.id, { spinNode: shaftRef.current })
  }, [component.id])
  return (
    <group>
      <mesh position={[0, 10, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[10, 10, 25, 28]} />
        <meshStandardMaterial color="#b0bec5" metalness={0.8} roughness={0.3} />
      </mesh>
      <group ref={shaftRef} position={[16.5, 10, 0]} rotation={[0, 0, Math.PI / 2]}>
        <mesh>
          <cylinderGeometry args={[1, 1, 8, 12]} />
          <meshStandardMaterial color="#78909c" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* small paddle so rotation is visible */}
        <mesh position={[0, -2.5, 0]}>
          <boxGeometry args={[6, 1.2, 0.8]} />
          <meshStandardMaterial color="#eceff1" roughness={0.6} />
        </mesh>
      </group>
    </group>
  )
}

function NeopixelModel({ component }: { component: BoardComponent }) {
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: "#fafafa",
        emissive: "#ffffff",
        emissiveIntensity: 0,
      }),
    [],
  )
  useLayoutEffect(
    () => registerPartNodes(component.id, { emissiveMaterial: material }),
    [component.id, material],
  )
  return (
    <group>
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[5, 1.6, 5]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.9, 0]} material={material}>
        <boxGeometry args={[3, 0.6, 3]} />
      </mesh>
    </group>
  )
}

/** HC-SR04: blue PCB with two upright transducer barrels. */
function UltrasonicModel(_props: { component: BoardComponent }) {
  return (
    <group>
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[45, 1.6, 20]} />
        <meshStandardMaterial color="#1a237e" roughness={0.7} />
      </mesh>
      {[-12, 12].map((x) => (
        <mesh key={x} position={[x, 7.6, 0]}>
          <cylinderGeometry args={[8, 8, 12, 24]} />
          <meshStandardMaterial color="#b0bec5" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
    </group>
  )
}

function ButtonModel(_props: { component: BoardComponent }) {
  return (
    <group>
      <mesh position={[0, 1.75, 0]}>
        <boxGeometry args={[6, 3.5, 6]} />
        <meshStandardMaterial color="#37474f" roughness={0.6} />
      </mesh>
      <mesh position={[0, 4, 0]}>
        <cylinderGeometry args={[1.75, 1.75, 1.5, 16]} />
        <meshStandardMaterial color="#111111" roughness={0.5} />
      </mesh>
    </group>
  )
}

function BuzzerModel(_props: { component: BoardComponent }) {
  return (
    <mesh position={[0, 3.75, 0]}>
      <cylinderGeometry args={[6, 6, 7.5, 28]} />
      <meshStandardMaterial color="#212121" roughness={0.55} />
    </mesh>
  )
}

/** Two-terminal axial part (resistor/capacitor): body spanning its two holes. */
function AxialModel({
  component,
  color,
  thickness,
}: {
  component: BoardComponent
  color: string
  thickness: number
}) {
  const fp = componentFootprint(component)
  if (fp.points.length < 2) return <FallbackBox component={component} />
  const first = gridToPixel(fp.points[0])
  const last = gridToPixel(fp.points[fp.points.length - 1])
  const a = pixelToWorld(first.x, first.y)
  const b = pixelToWorld(last.x, last.y)
  // The parent group sits on the footprint centroid, so draw relative to it.
  const dx = b.x - a.x
  const dz = b.z - a.z
  const span = Math.hypot(dx, dz)
  const yaw = Math.atan2(-dz, dx)
  const bodyLength = Math.max(4, span * 0.55)
  return (
    <group rotation={[0, yaw, 0]}>
      {/* lead wire spanning the two holes */}
      <mesh position={[0, 1.2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.35, 0.35, span, 8]} />
        <meshStandardMaterial color="#9e9e9e" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, 1.2 + thickness * 0.25, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[thickness / 2, thickness / 2, bodyLength, 16]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    </group>
  )
}

/** Read a numeric property with a fallback (e.g. an IC's pin count). */
function numberProp(component: BoardComponent, key: string, fallback: number): number {
  const value = component.properties[key]
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

/** DIP chip (IC, shift register): black body with a pin-1 notch + two leg rows. */
function DipChipModel({ component, defaultPins }: { component: BoardComponent; defaultPins: number }) {
  const pins = Math.max(4, Math.round(numberProp(component, "pins", defaultPins)))
  const perSide = Math.max(2, Math.round(pins / 2))
  const pitch = 2.54
  const bodyLength = perSide * pitch
  const bodyWidth = 6.4
  const legOffsets = Array.from({ length: perSide }, (_, i) => (i - (perSide - 1) / 2) * pitch)
  return (
    <group>
      {/* body */}
      <mesh position={[0, 2, 0]}>
        <boxGeometry args={[bodyLength, 3, bodyWidth]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.5} />
      </mesh>
      {/* pin-1 notch */}
      <mesh position={[-bodyLength / 2 + 0.3, 3.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.2, 1.2, 0.6, 12, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#3a3a3a" roughness={0.6} />
      </mesh>
      {/* legs */}
      {[-1, 1].map((side) =>
        legOffsets.map((x) => (
          <mesh key={`${side}-${x}`} position={[x, 0.6, side * (bodyWidth / 2 + 0.6)]}>
            <boxGeometry args={[0.6, 1.2, 1.5]} />
            <meshStandardMaterial color="#cfd8dc" metalness={0.7} roughness={0.35} />
          </mesh>
        )),
      )}
    </group>
  )
}

/** TO-92 3-pin package (transistor, TO-92 sensors, IR receiver): flat-faced
 * black half-cylinder on three legs. `bump` adds an IR receiver's front lens. */
function To92Model({ bump = false }: { component: BoardComponent; bump?: boolean }) {
  return (
    <group>
      {/* legs */}
      {[-1.27, 0, 1.27].map((x) => (
        <mesh key={x} position={[x, 1.5, 1.5]}>
          <boxGeometry args={[0.5, 3, 0.5]} />
          <meshStandardMaterial color="#cfd8dc" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
      {/* body: cylinder with a flat front (scaled a touch on z) */}
      <mesh position={[0, 5.5, 0]} scale={[1, 1, 0.8]}>
        <cylinderGeometry args={[2.5, 2.5, 5, 20]} />
        <meshStandardMaterial color="#212121" roughness={0.55} />
      </mesh>
      {bump && (
        <mesh position={[0, 5.5, 1.9]}>
          <sphereGeometry args={[1.6, 16, 12]} />
          <meshStandardMaterial color="#2a2a2a" roughness={0.4} />
        </mesh>
      )}
    </group>
  )
}

/** TO-220 power package (MOSFET): plastic body + metal tab with a mounting hole. */
function To220Model(_props: { component: BoardComponent }) {
  return (
    <group>
      {[-2.54, 0, 2.54].map((x) => (
        <mesh key={x} position={[x, 1.5, 1.2]}>
          <boxGeometry args={[0.7, 3, 0.5]} />
          <meshStandardMaterial color="#cfd8dc" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
      {/* plastic body */}
      <mesh position={[0, 6, 0]}>
        <boxGeometry args={[10, 9, 4.5]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.55} />
      </mesh>
      {/* metal heatsink tab above the body */}
      <mesh position={[0, 12.5, -0.5]}>
        <boxGeometry args={[10, 4, 1.4]} />
        <meshStandardMaterial color="#b0bec5" metalness={0.85} roughness={0.3} />
      </mesh>
      {/* mounting hole (dark disc on the tab) */}
      <mesh position={[0, 13, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.1, 1.1, 1.6, 14]} />
        <meshStandardMaterial color="#37474f" roughness={0.6} />
      </mesh>
    </group>
  )
}

/** Potentiometer: cylindrical base + a turnable knob with an indicator line. */
function PotentiometerModel(_props: { component: BoardComponent }) {
  return (
    <group>
      {/* metal base */}
      <mesh position={[0, 3.5, 0]}>
        <boxGeometry args={[12, 7, 12]} />
        <meshStandardMaterial color="#9e9e9e" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* shaft */}
      <mesh position={[0, 8, 0]}>
        <cylinderGeometry args={[2.5, 2.5, 3, 20]} />
        <meshStandardMaterial color="#455a64" roughness={0.5} />
      </mesh>
      {/* knob */}
      <mesh position={[0, 10.5, 0]}>
        <cylinderGeometry args={[4.5, 4, 3, 24]} />
        <meshStandardMaterial color="#263238" roughness={0.5} />
      </mesh>
      {/* indicator line */}
      <mesh position={[0, 12.1, 2]}>
        <boxGeometry args={[0.8, 0.4, 3.5]} />
        <meshStandardMaterial color="#eceff1" roughness={0.5} />
      </mesh>
    </group>
  )
}

/** A PCB module with an inset display panel (LCD, OLED, 7-segment). */
function ScreenModuleModel({
  component,
  boardColor,
  screenColor,
  height,
}: {
  component: BoardComponent
  boardColor: string
  screenColor: string
  height: number
}) {
  const fp = componentFootprint(component)
  const width = Math.max(20, pxToMm(fp.width))
  const depth = Math.max(14, pxToMm(fp.height))
  return (
    <group>
      {/* PCB */}
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[width, 2, depth]} />
        <meshStandardMaterial color={boardColor} roughness={0.7} />
      </mesh>
      {/* screen panel */}
      <mesh position={[0, 2 + height / 2, 0]}>
        <boxGeometry args={[width * 0.82, height, depth * 0.68]} />
        <meshStandardMaterial color={screenColor} roughness={0.35} metalness={0.1} />
      </mesh>
    </group>
  )
}

/** Seven-segment display: dark block with lit-red segment bars. */
function SevenSegmentModel({ component }: { component: BoardComponent }) {
  const fp = componentFootprint(component)
  const width = Math.max(12, pxToMm(fp.width))
  const depth = Math.max(16, pxToMm(fp.height))
  return (
    <group>
      <mesh position={[0, 3, 0]}>
        <boxGeometry args={[width, 6, depth]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.5} />
      </mesh>
      {/* two horizontal + implied segments as a red panel inset */}
      <mesh position={[0, 6.1, 0]}>
        <boxGeometry args={[width * 0.55, 0.4, depth * 0.7]} />
        <meshStandardMaterial color="#5a0f0f" emissive="#c62828" emissiveIntensity={0.25} />
      </mesh>
    </group>
  )
}

/** Relay: blue module box with a parting line and terminal pins. */
function RelayModel(_props: { component: BoardComponent }) {
  return (
    <group>
      <mesh position={[0, 7.5, 0]}>
        <boxGeometry args={[19, 15, 15]} />
        <meshStandardMaterial color="#1e88e5" roughness={0.6} />
      </mesh>
      {/* parting line */}
      <mesh position={[0, 13, 0]}>
        <boxGeometry args={[19.3, 0.6, 15.3]} />
        <meshStandardMaterial color="#1565c0" roughness={0.6} />
      </mesh>
      {/* terminals */}
      {[-6, 0, 6].map((x) => (
        <mesh key={x} position={[x, 0.6, 6]}>
          <boxGeometry args={[1, 1.2, 1]} />
          <meshStandardMaterial color="#cfd8dc" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
    </group>
  )
}

/** PIR motion sensor: small PCB under a white fresnel dome. */
function PirSensorModel(_props: { component: BoardComponent }) {
  return (
    <group>
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[24, 2, 24]} />
        <meshStandardMaterial color="#1a237e" roughness={0.7} />
      </mesh>
      <mesh position={[0, 8, 0]}>
        <sphereGeometry args={[11, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.4} transparent opacity={0.9} />
      </mesh>
    </group>
  )
}

/** DHT temperature/humidity sensor: blue perforated box. */
function DhtSensorModel(_props: { component: BoardComponent }) {
  return (
    <group>
      <mesh position={[0, 6, 0]}>
        <boxGeometry args={[15.5, 12, 7]} />
        <meshStandardMaterial color="#1565c0" roughness={0.65} />
      </mesh>
      {/* vent grid */}
      {[-4, 0, 4].map((x) =>
        [2, 6, 10].map((y) => (
          <mesh key={`${x}-${y}`} position={[x, y, 3.6]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.9, 0.9, 0.6, 8]} />
            <meshStandardMaterial color="#0d47a1" roughness={0.7} />
          </mesh>
        )),
      )}
    </group>
  )
}

/** Clear-domed 4-lead RGB LED; its dome glows from the solved brightness. */
function RgbLedModel({ component }: { component: BoardComponent }) {
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: "#e0e0e0",
        emissive: "#ffffff",
        emissiveIntensity: 0,
        transparent: true,
        opacity: 0.6,
      }),
    [],
  )
  useLayoutEffect(
    () => registerPartNodes(component.id, { emissiveMaterial: material }),
    [component.id, material],
  )
  return (
    <group>
      {[-1.5, -0.5, 0.5, 1.5].map((x) => (
        <mesh key={x} position={[x, 1.5, 0]}>
          <boxGeometry args={[0.4, 3, 0.4]} />
          <meshStandardMaterial color="#9e9e9e" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 4, 0]} material={material}>
        <cylinderGeometry args={[2.5, 2.5, 2.5, 24]} />
      </mesh>
      <mesh position={[0, 5.25, 0]} material={material}>
        <sphereGeometry args={[2.5, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
    </group>
  )
}

/** Photoresistor (LDR): round tan disc with a dark serpentine track, two legs. */
function PhotoresistorModel(_props: { component: BoardComponent }) {
  return (
    <group>
      {[-1.5, 1.5].map((x) => (
        <mesh key={x} position={[x, 1.5, 0]}>
          <boxGeometry args={[0.4, 3, 0.4]} />
          <meshStandardMaterial color="#9e9e9e" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 3.5, 0]}>
        <cylinderGeometry args={[3, 3, 1.5, 24]} />
        <meshStandardMaterial color="#d7c58c" roughness={0.6} />
      </mesh>
      {/* serpentine track */}
      {[-1.4, 0, 1.4].map((z) => (
        <mesh key={z} position={[0, 4.3, z]}>
          <boxGeometry args={[5, 0.3, 0.5]} />
          <meshStandardMaterial color="#37474f" roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

/** Inductor: ferrite core with a few copper wire wraps. */
function InductorModel(_props: { component: BoardComponent }) {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh position={[0, 4, 0]}>
        <cylinderGeometry args={[2.2, 2.2, 9, 20]} />
        <meshStandardMaterial color="#3e2723" roughness={0.7} />
      </mesh>
      {[-2.5, 0, 2.5].map((y) => (
        <mesh key={y} position={[0, 4 + y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.4, 0.5, 8, 20]} />
          <meshStandardMaterial color="#c77b3b" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
    </group>
  )
}

// ── Tier 2: extruded custom-part SVG ────────────────────────────────────────
//
// Custom DSL parts carry raw SVG plus optional `visual.bindings` that animate
// elements (by id) from behavior signals — the same system the 2D renderer
// uses. We extrude the SVG grouped by element id: bound targets become their
// own groups whose transform + opacity the frame effect drives from live
// signal values, mirroring the 2D applyBinding math. Because the SVG is laid
// flat (rotateX 90°), a 2D in-plane rotate/translate/scale maps to a
// horizontal-plane motion — a rotor spins flat, a slider slides across.

type SvgMesh = { geometry: ExtrudeGeometry; material: MeshStandardMaterial }
/** One SVG element's extruded meshes; `target` set when it's a binding target. */
type SvgElement = { target: string | null; meshes: SvgMesh[]; center: Vector3 }
type SvgBuild = { elements: SvgElement[]; size: Vector3; center: Vector3 }

function buildSvgGeometry(svg: string, targets: Set<string>): SvgBuild | null {
  try {
    const data = new SVGLoader().parse(svg)
    // Group extruded shapes by their source element id; non-target elements
    // collapse into one static bucket.
    const byKey = new Map<string, { target: string | null; meshes: SvgMesh[] }>()
    for (const path of data.paths) {
      const style = path.userData?.style as { fill?: string } | undefined
      const fill = style?.fill && style.fill !== "none" ? style.fill : "#607d8b"
      const node = path.userData?.node as { getAttribute?: (n: string) => string | null } | undefined
      const id = node?.getAttribute?.("id") ?? null
      const isTarget = id != null && targets.has(id)
      const key = isTarget ? `t:${id}` : "__static__"
      let bucket = byKey.get(key)
      if (!bucket) {
        bucket = { target: isTarget ? id : null, meshes: [] }
        byKey.set(key, bucket)
      }
      for (const shape of path.toShapes()) {
        bucket.meshes.push({
          geometry: new ExtrudeGeometry(shape, { depth: SVG_BODY_HEIGHT_MM, bevelEnabled: false }),
          material: new MeshStandardMaterial({ color: fill, roughness: 0.6 }),
        })
      }
    }

    const elements: SvgElement[] = []
    const bounds = new Box3()
    const elementBox = new Box3()
    for (const bucket of byKey.values()) {
      if (bucket.meshes.length === 0) continue
      elementBox.makeEmpty()
      for (const mesh of bucket.meshes) {
        mesh.geometry.computeBoundingBox()
        if (mesh.geometry.boundingBox) {
          bounds.union(mesh.geometry.boundingBox)
          elementBox.union(mesh.geometry.boundingBox)
        }
      }
      elements.push({
        target: bucket.target,
        meshes: bucket.meshes,
        center: elementBox.getCenter(new Vector3()),
      })
    }

    if (elements.length === 0) return null
    const size = bounds.getSize(new Vector3())
    if (size.x <= 0 || size.y <= 0) {
      for (const element of elements) for (const mesh of element.meshes) mesh.geometry.dispose()
      return null
    }
    return { elements, size, center: bounds.getCenter(new Vector3()) }
  } catch {
    return null
  }
}

function evalBinding(value: number | string | undefined, ctx: Record<string, number>): number | undefined {
  if (value === undefined) return undefined
  if (typeof value === "number") return value
  try {
    return evaluateExpression(value, ctx)
  } catch {
    return undefined
  }
}

export type SvgElementTransform = {
  position: [number, number, number]
  rotationZ: number
  scale: number
  opacity?: number
}

/**
 * Compose a visual binding into a single group transform, mirroring the 2D
 * renderer's `translate(t)·translate(c)·rotate·scale·translate(-c)` about an
 * origin. Solving for the group's position gives `p = c − s·R·c + t`, so a
 * bound rotor spins about its hub without a pivot-group stack. `center` is the
 * element's default origin (its bbox centre) when the binding omits one.
 */
export function svgBindingTransform(
  binding: DslBinding,
  context: Record<string, number>,
  center: { x: number; y: number },
): SvgElementTransform {
  const rotate = evalBinding(binding.rotate, context)
  const scale = evalBinding(binding.scale, context)
  const tx = evalBinding(binding.translateX, context) ?? 0
  const ty = evalBinding(binding.translateY, context) ?? 0
  const opacity = evalBinding(binding.opacity, context)

  const theta = rotate !== undefined ? (rotate * Math.PI) / 180 : 0
  const s = scale ?? 1
  const cx = binding.originX ?? center.x
  const cy = binding.originY ?? center.y
  const rcx = Math.cos(theta) * cx - Math.sin(theta) * cy
  const rcy = Math.sin(theta) * cx + Math.cos(theta) * cy
  return {
    position: [cx - s * rcx + tx, cy - s * rcy + ty, 0],
    rotationZ: theta,
    scale: s,
    opacity: opacity !== undefined ? Math.min(1, Math.max(0, opacity)) : undefined,
  }
}

function ExtrudedSvgModel({
  component,
  svg,
  bindings,
  signalNames,
}: {
  component: BoardComponent
  svg: string
  bindings: DslBinding[]
  signalNames: string[]
}) {
  const fp = componentFootprint(component)
  const invalidate = useThree((state) => state.invalidate)

  const targets = useMemo(() => new Set(bindings.map((b) => b.target)), [bindings])
  const build = useMemo(() => buildSvgGeometry(svg, targets), [svg, targets])

  useLayoutEffect(() => {
    if (!build) return
    return () => {
      for (const element of build.elements)
        for (const mesh of element.meshes) {
          mesh.geometry.dispose()
          mesh.material.dispose()
        }
    }
  }, [build])

  // Live signal values (published per sim tick under libraryState.custom).
  const signalValues = useBoardSelector((ctx) => ctx.libraryState.custom?.[component.id])
  const context = useMemo(() => {
    const out: Record<string, number> = {}
    for (const [key, value] of Object.entries(component.properties)) {
      if (typeof value === "number") out[key] = value
    }
    for (const name of signalNames) out[name] = 0
    if (signalValues) Object.assign(out, signalValues)
    return out
  }, [component.properties, signalNames, signalValues])

  // Group nodes for bound elements, collected via callback ref.
  const groupRefs = useRef(new Map<string, Group>())
  const elementMaterials = useMemo(() => {
    const map = new Map<string, MeshStandardMaterial[]>()
    if (build) {
      for (const element of build.elements) {
        if (element.target) map.set(element.target, element.meshes.map((m) => m.material))
      }
    }
    return map
  }, [build])

  // Apply the evaluated bindings to their element groups. Mirrors the 2D
  // renderer's transform: translate(t) · about-origin(rotate, scale). Composed
  // into a single group so a rotor spins about its hub without a pivot stack.
  useLayoutEffect(() => {
    if (!build) return
    for (const binding of bindings) {
      const group = groupRefs.current.get(binding.target)
      if (!group) continue
      const element = build.elements.find((e) => e.target === binding.target)
      const t = svgBindingTransform(binding, context, element?.center ?? { x: 0, y: 0 })
      group.position.set(t.position[0], t.position[1], t.position[2])
      group.rotation.z = t.rotationZ
      group.scale.set(t.scale, t.scale, 1)
      if (t.opacity !== undefined) {
        for (const material of elementMaterials.get(binding.target) ?? []) {
          material.transparent = true
          material.opacity = t.opacity
        }
      }
    }
    invalidate()
  }, [build, bindings, context, elementMaterials, invalidate])

  if (!build) return <FallbackBox component={component} />

  // Fit the SVG's XY bounds onto the part's footprint (px → mm), uniformly.
  const scale = Math.min(
    Math.max(4, pxToMm(fp.width)) / build.size.x,
    Math.max(4, pxToMm(fp.height)) / build.size.y,
  )
  // Lay the SVG flat: rotateX(+90°) maps SVG y-down onto world +z, sending the
  // extrusion (SVG +z) to world -y — so lift the group by the body height.
  return (
    <group
      position={[-build.center.x * scale, SVG_BODY_HEIGHT_MM, -build.center.y * scale]}
      rotation={[Math.PI / 2, 0, 0]}
      scale={[scale, scale, 1]}
    >
      {build.elements.map((element, elementIndex) =>
        element.target ? (
          <group
            key={element.target}
            ref={(node) => {
              if (node) groupRefs.current.set(element.target as string, node)
              else groupRefs.current.delete(element.target as string)
            }}
          >
            {element.meshes.map((mesh, i) => (
              // eslint-disable-next-line react/no-array-index-key -- meshes rebuild atomically with the svg
              <mesh key={i} geometry={mesh.geometry} material={mesh.material} />
            ))}
          </group>
        ) : (
          element.meshes.map((mesh, i) => (
            // eslint-disable-next-line react/no-array-index-key -- meshes rebuild atomically with the svg
            <mesh key={`${elementIndex}-${i}`} geometry={mesh.geometry} material={mesh.material} />
          ))
        ),
      )}
    </group>
  )
}

// ── Tier 3: footprint-sized box ─────────────────────────────────────────────

function FallbackBox({ component }: { component: BoardComponent }) {
  const fp = componentFootprint(component)
  const width = Math.max(4, pxToMm(fp.width))
  const depth = Math.max(4, pxToMm(fp.height))
  return (
    <mesh position={[0, 2.5, 0]}>
      <boxGeometry args={[width, 5, depth]} />
      <meshStandardMaterial color="#78909c" roughness={0.65} />
    </mesh>
  )
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

export function PartMesh({ component }: { component: BoardComponent }) {
  const center = footprintCenter(component)
  const yaw = rotationYaw(component.rotation)
  const rootRef = useRef<Group>(null)
  useLayoutEffect(() => {
    if (!rootRef.current) return
    return registerPartNodes(component.id, { rootNode: rootRef.current })
  }, [component.id])

  // Subscribed lookup so a custom part registered after mount (e.g. fetched
  // on demand for an MCP-authored board) swaps in its real body live.
  const lookupCustomDef = () =>
    isCustomComponentType(component.type) ? getCustomDef(component.type) : undefined
  const customDef = useSyncExternalStore(subscribeCustom, lookupCustomDef, lookupCustomDef)

  let body: ReactNode
  switch (component.type) {
    case "led":
      body = <LedModel component={component} />
      break
    case "servo":
      body = <ServoModel component={component} />
      break
    case "dc_motor":
      body = <DcMotorModel component={component} />
      break
    case "neopixel":
      body = <NeopixelModel component={component} />
      break
    case "ultrasonic_sensor":
      body = <UltrasonicModel component={component} />
      break
    case "button":
      body = <ButtonModel component={component} />
      break
    case "buzzer":
      body = <BuzzerModel component={component} />
      break
    case "resistor":
      body = <AxialModel component={component} color="#d7b98c" thickness={3} />
      break
    case "capacitor":
      body = <AxialModel component={component} color="#3949ab" thickness={5} />
      break
    case "ic":
      body = <DipChipModel component={component} defaultPins={8} />
      break
    case "shift_register":
      body = <DipChipModel component={component} defaultPins={16} />
      break
    case "transistor":
    case "temperature_sensor":
      body = <To92Model component={component} />
      break
    case "ir_receiver":
      body = <To92Model component={component} bump />
      break
    case "mosfet":
      body = <To220Model component={component} />
      break
    case "potentiometer":
      body = <PotentiometerModel component={component} />
      break
    case "lcd_16x2":
      body = (
        <ScreenModuleModel component={component} boardColor="#1b5e20" screenColor="#1e88e5" height={5} />
      )
      break
    case "oled_display":
      body = (
        <ScreenModuleModel component={component} boardColor="#212121" screenColor="#0a0a0a" height={2.5} />
      )
      break
    case "seven_segment":
      body = <SevenSegmentModel component={component} />
      break
    case "relay":
      body = <RelayModel component={component} />
      break
    case "pir_sensor":
      body = <PirSensorModel component={component} />
      break
    case "dht_sensor":
      body = <DhtSensorModel component={component} />
      break
    case "rgb_led":
      body = <RgbLedModel component={component} />
      break
    case "photoresistor":
      body = <PhotoresistorModel component={component} />
      break
    case "inductor":
      body = <InductorModel component={component} />
      break
    default: {
      const customSvg = customDef?.svg
      body = customSvg ? (
        <ExtrudedSvgModel
          component={component}
          svg={customSvg}
          bindings={customDef?.visualBindings ?? []}
          signalNames={customDef?.signalNames ?? []}
        />
      ) : (
        <FallbackBox component={component} />
      )
    }
  }

  return (
    // Parts sit on the breadboard's top face, not the world floor.
    <group ref={rootRef} position={[center.x, BOARD_SURFACE_Y, center.z]} rotation={[0, yaw, 0]}>
      {body}
    </group>
  )
}
