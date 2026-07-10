// ── GLB part models ──────────────────────────────────────────────────────────
//
// Config-driven replacement of the procedural part bodies with real GLB models.
// One generic <GlbPartModel> loads a part's GLB, orients it upright (base into
// the board), scales it to a target height, rests it on the board surface, and
// (for LEDs) recolours the dome + registers it for the simulator's glow.
//
// Everything a part needs is one row in GLB_PARTS — so when a model sits wrong
// in the app, tune its `rotation` / `heightMm` / `liftMm` here, no code digging.
// Orientation/scale below are BEST-GUESS from each GLB's authored axes and are
// meant to be eyeballed + tweaked in the desktop app.

import { useLayoutEffect, useMemo } from "react"
import { Box3, Group, MeshStandardMaterial, Vector3 } from "three"
import type { Material, Mesh, Object3D } from "three"
import { useGLTF } from "@react-three/drei"
import type { BoardComponent } from "@dreamer/schemas"
import { registerPartNodes } from "./scene-registry"
import { resolveLedColor } from "./led-colors"
import { fitSimilarity2D } from "./similarity-2d"
import { footprintCenter, footprintPinTargets, rotationYaw } from "./part-frame"
import { usePinCalibrations } from "./component-pin-calibration"
import { useGridCalibration } from "./breadboard-grid-calibration"

import ledUrl from "@/assets/led.glb?url"
import rgbLedUrl from "@/assets/rgb-led.glb?url"
import buzzerUrl from "@/assets/buzzer.glb?url"
import potentiometerUrl from "@/assets/potentiometer.glb?url"
import ultrasonicUrl from "@/assets/ultrasonic.glb?url"
import temperatureUrl from "@/assets/temperature-sensor.glb?url"
import relayUrl from "@/assets/relay.glb?url"
import lcdUrl from "@/assets/lcd.glb?url"
import oledUrl from "@/assets/oled.glb?url"
import servoUrl from "@/assets/servo.glb?url"

type GlbBehavior = "led" | "rgb" | "servo"

export type GlbPartConfig = {
  url: string
  /** Euler (radians) to bring the model upright: base down toward the board. */
  rotation: [number, number, number]
  /** Scale the model so its upright height is this many mm (normalises author
   *  scale — the GLBs are authored in metres at inconsistent real sizes). */
  heightMm: number
  /** Extra lift (mm) above the board after the base is rested at Y=0. */
  liftMm: number
  /** LED-style dome: recolour + register the emissive material for the sim. */
  behavior?: GlbBehavior
}

/**
 * Per-type GLB config. Rotation/height/lift are first-pass guesses tuned in the
 * desktop app. `-90°X` uprights a Z-up authored model (pins along −Y); `0` means
 * the model already imports Y-up.
 */
export const GLB_PARTS: Partial<Record<string, GlbPartConfig>> = {
  led: { url: ledUrl, rotation: [0, 0, 0], heightMm: 11, liftMm: 0, behavior: "led" },
  rgb_led: { url: rgbLedUrl, rotation: [0, 0, 0], heightMm: 11, liftMm: 0, behavior: "rgb" },
  buzzer: { url: buzzerUrl, rotation: [0, 0, 0], heightMm: 16, liftMm: 0 },
  // Pot & temp are authored face-forward (+Z) with pins down; −90°X stands the
  // face/knob up (+Y) so it reads like the old procedural knob-up part.
  potentiometer: { url: potentiometerUrl, rotation: [-Math.PI / 2, 0, 0], heightMm: 20, liftMm: 0 },
  ultrasonic_sensor: { url: ultrasonicUrl, rotation: [0, 0, 0], heightMm: 20, liftMm: 0 },
  temperature_sensor: { url: temperatureUrl, rotation: [-Math.PI / 2, 0, 0], heightMm: 12, liftMm: 0 },
  relay: { url: relayUrl, rotation: [0, 0, 0], heightMm: 20, liftMm: 0 },
  lcd_16x2: { url: lcdUrl, rotation: [0, 0, 0], heightMm: 12, liftMm: 0 },
  oled_display: { url: oledUrl, rotation: [0, 0, 0], heightMm: 15, liftMm: 0 },
  servo: { url: servoUrl, rotation: [0, 0, 0], heightMm: 23, liftMm: 0, behavior: "servo" },
}

/** Upright + height-normalize + centre-in-XZ + rest-on-Y=0. The "normalized
 *  frame": what both the renderer and the pin calibrator place the model in, so
 *  captured pin anchors and the render-time fit share one coordinate system. */
export function glbNormalize(
  model: Object3D,
  config: GlbPartConfig,
): { scale: number; position: [number, number, number] } {
  const probe = model.clone(true)
  probe.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2])
  probe.updateMatrixWorld(true)
  const box = new Box3().setFromObject(probe)
  const size = new Vector3()
  const center = new Vector3()
  box.getSize(size)
  box.getCenter(center)
  const factor = config.heightMm / (size.y || size.x || size.z || 1)
  return {
    scale: factor,
    position: [-center.x * factor, -box.min.y * factor + config.liftMm, -center.z * factor],
  }
}

/** The bare normalized model (no pin fit, no dome/servo rigging) — the calibrator
 *  renders this and lets the user drop anchors on its pins. */
export function GlbNormalizedModel({ config }: { config: GlbPartConfig }) {
  const { scene } = useGLTF(config.url)
  const model = useMemo(() => scene.clone(true), [scene])
  const { scale, position } = useMemo(() => glbNormalize(model, config), [model, config])
  return (
    <group position={position}>
      <group scale={scale}>
        <group rotation={config.rotation}>
          <primitive object={model} />
        </group>
      </group>
    </group>
  )
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true
}

/** First mesh whose material is translucent or named like a lens/dome/glass. */
function findDome(root: Object3D): Mesh | null {
  let dome: Mesh | null = null
  root.traverse((object) => {
    if (dome || !isMesh(object)) return
    const material = object.material
    if (Array.isArray(material)) return
    const named = /vidro|glass|lens|dome|led/i.test(material.name ?? "")
    if (named || (material as Material).transparent) dome = object
  })
  return dome
}

export function GlbPartModel({
  component,
  config,
}: {
  component: BoardComponent
  config: GlbPartConfig
}) {
  const { scene } = useGLTF(config.url)
  // Clone so each instance owns its graph (useGLTF caches the source scene).
  const model = useMemo(() => scene.clone(true), [scene])

  // LED/RGB dome: swap in a recolourable material and hand it to the sim so the
  // solved brightness drives its glow (matches the procedural LedModel).
  const colorKey = component.properties.color
  const domeMaterial = useMemo(() => {
    if (!config.behavior) return null
    const dome = findDome(model)
    if (!dome) return null
    const rgb = config.behavior === "rgb"
    const base = rgb ? "#e0e0e0" : resolveLedColor(colorKey)
    const material = new MeshStandardMaterial({
      color: base,
      emissive: rgb ? "#ffffff" : base,
      emissiveIntensity: 0,
      transparent: true,
      opacity: rgb ? 0.6 : 0.85,
    })
    dome.material = material
    return material
  }, [model, config.behavior, colorKey])

  useLayoutEffect(() => {
    if (!domeMaterial) return
    return registerPartNodes(component.id, { emissiveMaterial: domeMaterial })
  }, [component.id, domeMaterial])

  // Servo horn: reparent the horn (Protoboard.*) + hub (Metal.006) under a pivot
  // at the shaft and hand it to the sim as the angle node. The SG90 GLB loads
  // shaft-up (+Y), so the pivot spins about Y through the hub's world centre —
  // the sim sets node.rotation.y directly, no axis remap.
  const hornPivot = useMemo(() => {
    if (config.behavior !== "servo") return null
    const horns: Mesh[] = []
    let hub: Mesh | null = null
    model.traverse((object) => {
      if (!isMesh(object) || Array.isArray(object.material)) return
      const name = object.material.name ?? ""
      if (/protoboard/i.test(name)) horns.push(object)
      else if (/metal\.?0*6|matal/i.test(name)) hub = object
    })
    if (horns.length === 0) return null
    model.updateWorldMatrix(true, true)
    const center = new Vector3()
    new Box3().setFromObject(hub ?? horns[0]).getCenter(center)
    const pivot = new Group()
    pivot.position.copy(center)
    model.add(pivot)
    // attach() preserves each part's world pose while reparenting under the pivot.
    for (const part of hub ? [...horns, hub] : horns) pivot.attach(part)
    return pivot
  }, [model, config.behavior])

  useLayoutEffect(() => {
    if (!hornPivot) return
    return registerPartNodes(component.id, { angleNode: hornPivot })
  }, [component.id, hornPivot])

  // Orient upright, scale to the target height, centre in X/Z, rest the base on
  // the board (Y=0). This normalized frame is also what the pin calibrator
  // captures anchors in, so the fit below can map them onto the holes.
  const { scale, position } = useMemo(() => glbNormalize(model, config), [model, config])

  // Pin calibration: fit the captured model pins onto this instance's warped
  // footprint holes (uniform scale + rotation + translation). The captured pins
  // live in the normalized frame above; the targets are expressed in the
  // PartMesh-local frame (undo its centroid + yaw) so the outer group below,
  // sitting inside PartMesh, lands each pin on its hole. Falls back to the plain
  // height-scaled placement when a type isn't calibrated.
  const pinCal = usePinCalibrations()[component.type]
  const grid = useGridCalibration()
  const fit = useMemo(() => {
    if (!pinCal || pinCal.length < 2) return null
    const targets = footprintPinTargets(component)
    if (targets.length !== pinCal.length) return null
    const center = footprintCenter(component)
    const yaw = rotationYaw(component.rotation)
    const cosY = Math.cos(yaw)
    const sinY = Math.sin(yaw)
    const dst = targets.map((t) => {
      const rx = t.x - center.x
      const rz = t.z - center.z
      // R_y(-yaw) · rel — undo PartMesh's yaw so the fit is in its local frame.
      return { x: rx * cosY - rz * sinY, z: rx * sinY + rz * cosY }
    })
    return fitSimilarity2D(pinCal, dst)
    // grid drives warpedGridXZ inside footprintPinTargets — recompute on warp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinCal, component, grid])

  const normalized = (
    <group position={position}>
      <group scale={scale}>
        <group rotation={config.rotation}>
          <primitive object={model} />
        </group>
      </group>
    </group>
  )

  if (!fit) return normalized
  return (
    <group
      position={[fit.tx, 0, fit.tz]}
      rotation={[0, -fit.rotation, 0]}
      scale={fit.scale}
    >
      {normalized}
    </group>
  )
}

for (const config of Object.values(GLB_PARTS)) {
  if (config) useGLTF.preload(config.url)
}
