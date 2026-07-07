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
import type { Group } from "three"
import { Box3, ExtrudeGeometry, MeshStandardMaterial, Vector3 } from "three"
import { SVGLoader } from "three-stdlib"
import type { BoardComponent } from "@dreamer/schemas"
import { isCustomComponentType } from "@dreamer/schemas"
import { getCustomDef, subscribeCustom } from "@/components/catalog/custom-store"
import { getComponentFootprint, gridToPixel } from "@/breadboard/breadboard-grid"
import { pixelToWorld, pxToMm, type WorldPoint } from "./layout"
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

// ── Tier 2: extruded custom-part SVG ────────────────────────────────────────

type SvgBuild = {
  geometries: { geometry: ExtrudeGeometry; fill: string }[]
  size: Vector3
  center: Vector3
}

function buildSvgGeometry(svg: string): SvgBuild | null {
  try {
    const data = new SVGLoader().parse(svg)
    const geometries = data.paths.flatMap((path) => {
      const style = path.userData?.style as { fill?: string } | undefined
      const fill = style?.fill && style.fill !== "none" ? style.fill : "#607d8b"
      return path.toShapes().map((shape) => ({
        geometry: new ExtrudeGeometry(shape, { depth: SVG_BODY_HEIGHT_MM, bevelEnabled: false }),
        fill,
      }))
    })
    if (geometries.length === 0) return null
    const bounds = new Box3()
    for (const entry of geometries) {
      entry.geometry.computeBoundingBox()
      if (entry.geometry.boundingBox) bounds.union(entry.geometry.boundingBox)
    }
    const size = bounds.getSize(new Vector3())
    if (size.x <= 0 || size.y <= 0) {
      for (const entry of geometries) entry.geometry.dispose()
      return null
    }
    return { geometries, size, center: bounds.getCenter(new Vector3()) }
  } catch {
    return null
  }
}

function ExtrudedSvgModel({ component, svg }: { component: BoardComponent; svg: string }) {
  const fp = componentFootprint(component)
  const build = useMemo(() => buildSvgGeometry(svg), [svg])

  useLayoutEffect(() => {
    if (!build) return
    return () => {
      for (const entry of build.geometries) entry.geometry.dispose()
    }
  }, [build])

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
      {build.geometries.map((entry, index) => (
        // eslint-disable-next-line react/no-array-index-key -- geometry list is rebuilt atomically with the svg source
        <mesh key={index} geometry={entry.geometry}>
          <meshStandardMaterial color={entry.fill} roughness={0.6} />
        </mesh>
      ))}
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
    default: {
      const customSvg = customDef?.svg
      body = customSvg ? (
        <ExtrudedSvgModel component={component} svg={customSvg} />
      ) : (
        <FallbackBox component={component} />
      )
    }
  }

  return (
    <group ref={rootRef} position={[center.x, 0, center.z]} rotation={[0, yaw, 0]}>
      {body}
    </group>
  )
}
