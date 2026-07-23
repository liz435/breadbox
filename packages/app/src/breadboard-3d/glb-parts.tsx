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
import { Box3, Group, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3 } from "three"
import type { Material, Mesh, Object3D } from "three"
import { useGLTF } from "@react-three/drei"
import type { BoardComponent } from "@dreamer/schemas"
import { registerPartNodes } from "./scene-registry"
import { resolveLedColor } from "./led-colors"
import { computePinFit } from "./part-frame"
import { recordNormBounds } from "./part-volume"
import { createLcdScreen } from "./lcd-screen"
import { createOledScreen } from "./oled-screen"
import { createSevenSegmentScreen } from "./seven-segment-screen"
import { usePinCalibrations } from "./component-pin-calibration"
import { useGridCalibration } from "./breadboard-grid-calibration"

import ledUrl from "@/assets/led.glb?url"
import rgbLedUrl from "@/assets/rgb-led.glb?url"
import buzzerUrl from "@/assets/buzzer.glb?url"
import potentiometerUrl from "@/assets/potentiometer.glb?url"
import ultrasonicUrl from "@/assets/ultrasonic.glb?url"
import temperatureUrl from "@/assets/temperature-sensor.glb?url"
import dhtUrl from "@/assets/dht-sensor.glb?url"
import sevenSegUrl from "@/assets/seven-segment.glb?url"
import relayUrl from "@/assets/relay.glb?url"
import lcdUrl from "@/assets/lcd.glb?url"
import oledUrl from "@/assets/oled.glb?url"
import servoUrl from "@/assets/servo.glb?url"
import stepperUrl from "@/assets/stepper-uln2003.glb?url"
import powerModuleUrl from "@/assets/power-module.glb?url"

type GlbBehavior = "led" | "rgb" | "servo" | "stepper" | "pot" | "relay"

export type GlbPartConfig = {
  url: string
  /** Euler (radians) to bring the model upright: base down toward the board. */
  rotation: [number, number, number]
  /** Scale the model so its upright height is this many mm (normalises author
   *  scale — the GLBs are authored in metres at inconsistent real sizes). */
  heightMm: number
  /** Extra lift (mm) above the board after the base is rested at Y=0. */
  liftMm: number
  /** Sink the seated model this many mm down into the board, so a leaded part's
   *  legs disappear into the holes instead of resting a long stalk on the
   *  surface. Applied in world mm AFTER the pin fit (so it isn't rescaled by the
   *  fit), and only visual — the wire-obstacle volume and physics are unaffected.
   *  Keep it below the breadboard thickness (8.5 mm) so legs don't poke through
   *  the underside. */
  sinkMm?: number
  /** LED-style dome: recolour + register the emissive material for the sim. */
  behavior?: GlbBehavior
  /** Live display panel: `material` matches the model's display-face mesh; a flat
   *  screen plane is fitted to that face and driven from the sim. `lcd` paints the
   *  HD44780 text buffer; `oled` paints the SSD1306 128×64 framebuffer;
   *  `seven_seg` paints the a–g/dp segments over the module's static printed
   *  digit (front +Z face). */
  screen?: { kind: "lcd" | "oled" | "seven_seg"; material: RegExp }
}

/**
 * Per-type GLB config. Rotation/height/lift are first-pass guesses tuned in the
 * desktop app. `-90°X` uprights a Z-up authored model (pins along −Y); `0` means
 * the model already imports Y-up.
 */
export const GLB_PARTS: Partial<Record<string, GlbPartConfig>> = {
  // led.glb (led_2 model) is dome-dominant — the red translucent "vidro" dome is
  // ~45% of the height on short legs. Left out of the pin calibration (see
  // component-pin-calibration.ts) and sized here: heightMm sets the overall size
  // (dome ≈ 0.30 × heightMm wide) and sinkMm tucks the short leg into the board so
  // only the dome + a small stub shows.
  led: { url: ledUrl, rotation: [0, 0, 0], heightMm: 11, liftMm: 0, sinkMm: 4, behavior: "led" },
  rgb_led: { url: rgbLedUrl, rotation: [0, 0, 0], heightMm: 11, liftMm: 0, behavior: "rgb" },
  buzzer: { url: buzzerUrl, rotation: [0, 0, 0], heightMm: 16, liftMm: 0 },
  // Pot & temp are authored pins-down (−Y), so no rotation keeps the legs
  // dropping into the board. (The earlier −90°X stood the face up but laid the
  // pins out sideways in +Z, so they no longer plugged into the holes.)
  potentiometer: { url: potentiometerUrl, rotation: [0, 0, 0], heightMm: 20, liftMm: 0, behavior: "pot" },
  ultrasonic_sensor: { url: ultrasonicUrl, rotation: [0, 0, 0], heightMm: 20, liftMm: 0 },
  // temperature-sensor.glb is the real TO-92 temp sensor (temp.glb) — the module
  // that used to sit here was actually the DHT/humidity sensor, now on dht_sensor.
  // Leg-dominant like the LED: the METAL legs are ~13mm of the 17.6mm model, the
  // black CHIP_PRETO body only ~4.6mm. heightMm sizes the whole model (body ≈
  // 0.26 × heightMm tall) and sinkMm tucks the long legs into the board so the
  // body sits a few mm above the surface instead of floating on thin stalks.
  temperature_sensor: { url: temperatureUrl, rotation: [0, 0, 0], heightMm: 18, liftMm: 0, sinkMm: 8 },
  // Blue DHT11/humidity module on its little PCB (formerly mis-assigned to
  // temperature_sensor). Replaces the procedural DhtSensorModel via GLB_PARTS.
  dht_sensor: { url: dhtUrl, rotation: [0, 0, 0], heightMm: 22, liftMm: 0 },
  // Common-anode 7-segment module. The GLB's digit is a static printed "8." with
  // no per-segment geometry, so a live segment overlay is fitted onto the front
  // (+Z) black-plastic face and driven by the sim (createSevenSegmentScreen). The
  // module imports pins-down (−Y) and digit-forward (+Z) → no rotation.
  seven_segment: {
    url: sevenSegUrl,
    rotation: [0, 0, 0],
    heightMm: 18,
    liftMm: 0,
    screen: { kind: "seven_seg", material: /plasticopreto/i },
  },
  relay: { url: relayUrl, rotation: [0, 0, 0], heightMm: 20, liftMm: 0, behavior: "relay" },
  // Yaw about vertical to face the LCD the right way. The display already faces
  // up (+Y) via the GLB's Z-up→Y-up root, so a Y-rotation only spins it in-plane
  // (never tips the face). Tuned by eye; ±Math.PI/2 steps rotate it 90°.
  lcd_16x2: {
    url: lcdUrl,
    rotation: [0, Math.PI, 0],
    heightMm: 12,
    liftMm: 0,
    screen: { kind: "lcd", material: /display/i },
  },
  oled_display: {
    url: oledUrl,
    rotation: [0, 0, 0],
    heightMm: 15,
    liftMm: 0,
    // Mesh named "LCD" (material "material") is the active display rectangle.
    screen: { kind: "oled", material: /^material$/ },
  },
  // Smaller re-export of the SG90 (16.6 MB vs the old 24 MB). It DOES have the
  // Sketchfab Z-up→Y-up root (−90°X quaternion on Sketchfab_model), so it
  // imports Y-up — no config rotation (an extra −90°X laid it on its side).
  // The bundled jumper cable arcs to y≈52mm / z≈92mm and dominates the bbox:
  // heightMm is the full 67mm cable-inclusive bbox so the body renders at its
  // true ~32mm (23 shrank the whole model to a fifth — "servo not rendered").
  servo: { url: servoUrl, rotation: [0, 0, 0], heightMm: 67, liftMm: 0, behavior: "servo" },
  // 28BYJ-48 stepper + ULN2003 board (motor + driver in one GLB). Orientation
  // and heightMm are first-pass guesses to eyeball in the desktop app; the
  // "stepper" behavior spins the brass output shaft about the placed-part Y axis
  // from libraryState.steppers (see animation-driver). If the shaft spins about
  // the wrong axis, tweak `rotation` here so the shaft points up (+Y).
  stepper_motor: { url: stepperUrl, rotation: [0, 0, 0], heightMm: 30, liftMm: 0, behavior: "stepper" },
  // MB102 imports Y-up with its long edge along Z; −90°Y lays it landscape
  // along X to match the footprint (sign picked so the jack/USB end faces the
  // right way — +90°Y had it turned 180°).
  power_supply: { url: powerModuleUrl, rotation: [0, -Math.PI / 2, 0], heightMm: 22, liftMm: 0 },
}

/** Upright + height-normalize + centre-in-XZ + rest-on-Y=0. The "normalized
 *  frame": what both the renderer and the pin calibrator place the model in, so
 *  captured pin anchors and the render-time fit share one coordinate system. */
export function glbNormalize(
  model: Object3D,
  config: GlbPartConfig,
): {
  scale: number
  position: [number, number, number]
  bounds: { halfX: number; halfZ: number; height: number }
} {
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
    // Normalized-frame extents (post-scale): the wire-obstacle OBB is built from
    // these carried through the pin-calibration fit. See part-volume.ts.
    bounds: { halfX: (size.x * factor) / 2, halfZ: (size.z * factor) / 2, height: size.y * factor },
  }
}

/** The bare normalized model (no pin fit, no dome/servo rigging) — the calibrator
 *  renders this and lets the user drop anchors on its pins. */
export function GlbNormalizedModel({ config }: { config: GlbPartConfig }) {
  const { scene } = useGLTF(config.url)
  const model = useMemo(() => enableShadows(scene.clone(true)), [scene])
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

/**
 * Opt every mesh in a loaded model into the shadow pass.
 *
 * Both flags, deliberately: parts shadow the board *and* each other, and a part
 * that only casts reads as pasted on rather than sitting in the scene. Screen
 * overlay planes are excluded by their callers (they are emissive panels, and a
 * plane floating microns above a display face self-shadows into a dark smear).
 */
export function enableShadows(root: Object3D): Object3D {
  root.traverse((object) => {
    if (!isMesh(object)) return
    object.castShadow = true
    object.receiveShadow = true
  })
  return root
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

/** First mesh whose (single) material name matches `re` — used to locate a
 *  model's display face for the live LCD panel overlay. */
function findMeshByMaterial(root: Object3D, re: RegExp): Mesh | null {
  let found: Mesh | null = null
  root.traverse((object) => {
    if (found || !isMesh(object)) return
    const material = object.material
    if (Array.isArray(material)) return
    if (re.test(material.name ?? "")) found = object
  })
  return found
}

/** Tiny lift (model units, pre-scale) to float the screen plane over the display
 *  face without z-fighting. */
const SCREEN_LIFT = 0.0004

const UNIT_AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]

/** Fit a flat screen-overlay plane onto a display mesh's face. The display mesh
 *  is a thin slab; its thinnest bbox axis is the face normal, so the plane sits
 *  just outside that face pointing outward (away from the model centre — the
 *  display always faces off the module body). The plane is oriented by an
 *  explicit basis (longer in-plane axis → local +X so the wider texture edge, the
 *  128-px OLED width / LCD text run, lands along the display's long side; face
 *  normal → local +Z). Works for up-facing panels (LCD lies flat, thin in Y) and
 *  viewer-facing ones (OLED stands up, thin in Z) — and reproduces the LCD's
 *  previous orientation exactly. */
function screenOverlayFrame(box: Box3): {
  center: [number, number, number]
  size: [number, number]
  quaternion: [number, number, number, number]
} {
  const size = new Vector3()
  const center = new Vector3()
  box.getSize(size)
  box.getCenter(center)
  const s: [number, number, number] = [size.x, size.y, size.z]
  const c: [number, number, number] = [center.x, center.y, center.z]
  // Thinnest axis = the panel's normal; face outward (away from model centre).
  const thin = s[0] <= s[1] && s[0] <= s[2] ? 0 : s[1] <= s[2] ? 1 : 2
  const dir = c[thin] >= 0 ? 1 : -1
  const inPlane = [0, 1, 2].filter((i) => i !== thin)
  const [aLong, aShort] =
    s[inPlane[0]] >= s[inPlane[1]] ? [inPlane[0], inPlane[1]] : [inPlane[1], inPlane[0]]

  // Right-handed basis (u, v, n): u = long axis (texture width), n = outward
  // normal, v = n × u (short axis, texture height). makeBasis maps it to the
  // plane's local (X, Y, Z), so the texture never mirrors.
  const n = UNIT_AXES[thin].clone().multiplyScalar(dir)
  const u = UNIT_AXES[aLong].clone()
  const v = new Vector3().crossVectors(n, u)
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(u, v, n))

  const pos = [...c] as [number, number, number]
  pos[thin] = c[thin] + dir * (s[thin] / 2 + SCREEN_LIFT)
  return { center: pos, size: [s[aLong], s[aShort]], quaternion: [q.x, q.y, q.z, q.w] }
}

// −90° about X: rotates planeGeometry's default +Z normal up to +Y so the
// overlay lies flat on the module's top face. [sin(−45°),0,0,cos(−45°)].
const QUAT_FACE_UP: [number, number, number, number] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]

/** Overlay frame for the 7-segment module: a plane lying on the digit face — the
 *  +Y (top) face of this GLB, since its pins exit −Y and the printed digit sits
 *  opposite them. Faces +Y (QUAT_FACE_UP), sat just above the surface so it fully
 *  replaces the static printed digit. Sized from the black-plastic body box
 *  (X wide × Z long), inset so the module's rim shows as a bezel. Plane-local Y
 *  maps to world Z (the long axis) so the tall digit runs along the module. */
function sevenSegOverlayFrame(box: Box3): {
  center: [number, number, number]
  size: [number, number]
  quaternion: [number, number, number, number]
} {
  const size = new Vector3()
  const center = new Vector3()
  box.getSize(size)
  box.getCenter(center)
  return {
    center: [center.x, box.max.y + size.y * 0.02, center.z],
    size: [size.x * 0.86, size.z * 0.82],
    quaternion: QUAT_FACE_UP,
  }
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
  const model = useMemo(() => enableShadows(scene.clone(true)), [scene])

  // LED/RGB dome: swap in a recolourable material and hand it to the sim so the
  // solved brightness drives its glow (matches the procedural LedModel).
  // ONLY for LED-like behaviors — findDome keys on transparent materials, and
  // e.g. the SG90's translucent case would get repainted as a red LED dome.
  const colorKey = component.properties.color
  const domeMaterial = useMemo(() => {
    if (config.behavior !== "led" && config.behavior !== "rgb") return null
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

  // Servo horn: reparent the horn meshes (Protoboard.*) under a single pivot at
  // the horn centre and register that as the angle node — the sim sets its
  // rotation.y. This SG90 GLB imports Y-up (Sketchfab Z-up->Y-up root, config
  // rotation [0,0,0]), so the output shaft already points world +Y and the
  // pivot's local Y IS the shaft axis: the horn spins flat. (An earlier
  // re-export lacked that root and imported the shaft along +Z, which needed a
  // nested tilt pivot; the current model does not. If the horn ever tumbles
  // instead of spinning flat, its shaft isn't +Y and the pivot must re-align to
  // it — same single-pivot pattern as the stepper shaft.)
  const hornPivot = useMemo(() => {
    if (config.behavior !== "servo") return null
    const horns: Mesh[] = []
    model.traverse((object) => {
      if (!isMesh(object) || Array.isArray(object.material)) return
      if (/protoboard/i.test(object.material.name ?? "")) horns.push(object)
    })
    if (horns.length === 0) return null
    model.updateWorldMatrix(true, true)
    const center = new Vector3()
    new Box3().setFromObject(horns[0]).getCenter(center)
    const pivot = new Group()
    pivot.position.copy(center)
    model.add(pivot)
    // attach() preserves each horn's world pose while reparenting under the pivot.
    for (const part of horns) pivot.attach(part)
    return pivot
  }, [model, config.behavior])

  useLayoutEffect(() => {
    if (!hornPivot) return
    return registerPartNodes(component.id, { angleNode: hornPivot })
  }, [component.id, hornPivot])

  // Stepper output shaft: reparent the brass shaft (latao) under a pivot at its
  // centre and register it as the angle node. The animation driver sets
  // node.rotation.y to the sim's accumulated rotor angle. Spins about the
  // placed-part Y axis — if the shaft points a different way in this GLB, adjust
  // `rotation` in GLB_PARTS so the shaft ends up vertical (or change the axis
  // here). No-op if the shaft mesh isn't found (motor stays static, sim still
  // runs).
  const stepperPivot = useMemo(() => {
    if (config.behavior !== "stepper") return null
    let shaft: Mesh | null = null
    model.traverse((object) => {
      if (shaft || !isMesh(object) || Array.isArray(object.material)) return
      if (/latao|brass|shaft|eixo/i.test(object.material.name ?? "")) shaft = object
    })
    if (!shaft) return null
    const shaftMesh: Mesh = shaft
    model.updateWorldMatrix(true, true)
    const center = new Vector3()
    new Box3().setFromObject(shaftMesh).getCenter(center)
    const pivot = new Group()
    pivot.position.copy(center)
    model.add(pivot)
    pivot.attach(shaftMesh)
    return pivot
  }, [model, config.behavior])

  useLayoutEffect(() => {
    if (!stepperPivot) return
    return registerPartNodes(component.id, { angleNode: stepperPivot })
  }, [component.id, stepperPivot])

  // Potentiometer shaft: the brass (latao) mesh is the topmost part of the
  // model, so reparent it under a pivot at its centre and turn it with the
  // dialled value. Same pivot pattern as the horn/shaft above.
  const knobPivot = useMemo(() => {
    if (config.behavior !== "pot") return null
    const shaft = findMeshByMaterial(model, /latao|brass|knob/i)
    if (!shaft) return null
    model.updateWorldMatrix(true, true)
    const center = new Vector3()
    new Box3().setFromObject(shaft).getCenter(center)
    const pivot = new Group()
    pivot.position.copy(center)
    model.add(pivot)
    pivot.attach(shaft)
    return pivot
  }, [model, config.behavior])

  // Driven straight off the property, not through the animation loop: the knob
  // position IS the user's input to the circuit, so it should track the slider
  // exactly rather than being integrated toward like a physical process.
  const potValue = typeof component.properties.value === "number" ? component.properties.value : 50
  useLayoutEffect(() => {
    if (!knobPivot) return
    // A real trimmer sweeps ~270°, centred so 50% points straight ahead.
    knobPivot.rotation.y = ((potValue - 50) / 100) * (Math.PI * 1.5)
  }, [knobPivot, potValue])

  // Registration is deliberately split from the rotation above: re-registering
  // on every dial change would fire the registry's subscribers (wire obstacles,
  // the assembly panel) for a movement that changes none of them.
  useLayoutEffect(() => {
    if (!knobPivot) return
    return registerPartNodes(component.id, { knobNode: knobPivot })
  }, [component.id, knobPivot])

  // Relay indicator LED. The armature is sealed inside the blue can and can
  // never be seen, so the coil lamp is the honest visual — and it is what a
  // person actually watches on a real module.
  const indicatorMaterial = useMemo(() => {
    if (config.behavior !== "relay") return null
    const lamp = findMeshByMaterial(model, /vermelho|indicator/i)
    if (!lamp || Array.isArray(lamp.material)) return null
    const material = (lamp.material as MeshStandardMaterial).clone()
    material.emissive.set("#ff2d2d")
    material.emissiveIntensity = 0
    lamp.material = material
    return material
  }, [model, config.behavior])

  useLayoutEffect(() => {
    if (!indicatorMaterial) return
    return registerPartNodes(component.id, { indicatorMaterial })
  }, [component.id, indicatorMaterial])

  // Orient upright, scale to the target height, centre in X/Z, rest the base on
  // the board (Y=0). This normalized frame is also what the pin calibrator
  // captures anchors in, so the fit below can map them onto the holes.
  const { scale, position, bounds } = useMemo(() => glbNormalize(model, config), [model, config])

  // Publish this type's normalized body extents so the wire router can build an
  // oriented obstacle box for it (part-volume.ts) instead of a pin-sized disc.
  useLayoutEffect(() => {
    recordNormBounds(component.type, bounds)
  }, [component.type, bounds.halfX, bounds.halfZ, bounds.height])

  // Live display panel: fit a flat plane onto the model's display face and drive
  // its CanvasTexture from the sim (HD44780 text for LCD, SSD1306 framebuffer for
  // OLED). Built in the pre-config-rotation frame so it composes under the same
  // rotation/scale/position groups as the model and stays glued to the face.
  const screen = useMemo(() => {
    const cfg = config.screen
    if (!cfg) return null
    const mesh = findMeshByMaterial(model, cfg.material)
    if (!mesh) return null
    model.updateMatrixWorld(true)
    const box = new Box3().setFromObject(mesh)
    if (box.isEmpty()) return null
    // Build the panel and its registry entry in one kind-branch so `paint`
    // narrows to the right state type; the register effect stays kind-agnostic.
    if (cfg.kind === "seven_seg") {
      const panel = createSevenSegmentScreen()
      return {
        ...sevenSegOverlayFrame(box),
        material: new MeshBasicMaterial({ map: panel.texture, toneMapped: false }),
        node: { sevenSegScreen: { paint: panel.paint } },
        dispose: () => panel.dispose(),
      }
    }
    const frame = screenOverlayFrame(box)
    if (cfg.kind === "oled") {
      const panel = createOledScreen()
      return {
        ...frame,
        material: new MeshBasicMaterial({ map: panel.texture, toneMapped: false }),
        node: { oledScreen: { paint: panel.paint } },
        dispose: () => panel.dispose(),
      }
    }
    const panel = createLcdScreen()
    return {
      ...frame,
      material: new MeshBasicMaterial({ map: panel.texture, toneMapped: false }),
      node: { lcdScreen: { paint: panel.paint } },
      dispose: () => panel.dispose(),
    }
  }, [model, config.screen])

  useLayoutEffect(() => {
    if (!screen) return
    const unregister = registerPartNodes(component.id, screen.node)
    return () => {
      unregister()
      screen.material.dispose()
      screen.dispose()
    }
  }, [component.id, screen])

  // Pin calibration: fit the captured model pins onto this instance's warped
  // footprint holes (uniform scale + rotation + translation). Falls back to the
  // plain height-scaled placement when a type isn't calibrated. Shared with the
  // obstacle OBB via computePinFit so both place the part identically.
  const cal = usePinCalibrations()[component.type]
  const grid = useGridCalibration()
  const fit = useMemo(
    () => computePinFit(component, cal),
    // grid drives warpedGridXZ inside the fit targets — recompute on warp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cal, component, grid],
  )

  // Unit-scale mount anchor: a child of the moving node (servo horn / stepper
  // shaft) whose scale cancels the model's normalize + fit scale so its world
  // scale is ~1. A body parented onto the part's motion mounts here and lands at
  // mm scale — mounting on the raw scaled pivot bakes a tiny fraction (≈0.001)
  // into the body's transform and it renders invisibly small. The anchor rides
  // the pivot's rotation, so the mounted body still turns with the shaft.
  const movingPivot = hornPivot ?? stepperPivot
  const mountAnchor = useMemo(() => {
    if (!movingPivot) return null
    const anchor = new Group()
    anchor.name = "mount-anchor"
    movingPivot.add(anchor)
    return anchor
  }, [movingPivot])

  useLayoutEffect(() => {
    if (!mountAnchor || !movingPivot) return
    // Read the pivot's true world scale (normalize × fit × any GLB-internal
    // scale) and invert it, so the anchor sits at unit world scale. Re-runs when
    // fit/grid warp changes the pivot's scale.
    movingPivot.updateWorldMatrix(true, false)
    const worldScale = new Vector3()
    movingPivot.matrixWorld.decompose(new Vector3(), new Quaternion(), worldScale)
    mountAnchor.scale.setScalar(worldScale.x > 1e-9 ? 1 / worldScale.x : 1)
  }, [mountAnchor, movingPivot, scale, fit])

  useLayoutEffect(() => {
    if (!mountAnchor) return
    return registerPartNodes(component.id, { mountNode: mountAnchor })
  }, [component.id, mountAnchor])

  const normalized = (
    <group position={position}>
      <group scale={scale}>
        <group rotation={config.rotation}>
          <primitive object={model} />
          {screen && (
            // Flat live panel over the display face; screenOverlayFrame orients it
            // to the face normal (up for the LCD, viewer-facing for the OLED).
            <mesh position={screen.center} quaternion={screen.quaternion}>
              <planeGeometry args={screen.size} />
              <primitive object={screen.material} attach="material" />
            </mesh>
          )}
        </group>
      </group>
    </group>
  )

  // Sink the seated part into the board (world mm, applied outside the fit's
  // scale so it stays a true depth). Legs vanish into the holes; the dome sits at
  // the surface.
  const sink = config.sinkMm ?? 0
  const seated = fit ? (
    <group
      position={[fit.tx, 0, fit.tz]}
      rotation={[0, -fit.rotation, 0]}
      scale={fit.scale}
    >
      {normalized}
    </group>
  ) : (
    normalized
  )
  if (!sink) return seated
  return <group position={[0, -sink, 0]}>{seated}</group>
}

for (const config of Object.values(GLB_PARTS)) {
  if (config) useGLTF.preload(config.url)
}
