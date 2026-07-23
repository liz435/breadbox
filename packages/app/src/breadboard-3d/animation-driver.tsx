// ── Signal-driven animation loop ────────────────────────────────────────────
//
// One useFrame loop drives every animated node in the 3D scene from live
// simulator state, imperatively — sim values never flow through React state
// on their way to a transform. Sources:
//
//   libraryState.servos            → servo horn angle (rate-limited like a real SG90)
//   libraryState.motors            → DC motor shaft spin (inertia owned by the peripheral)
//   libraryState.relays            → relay coil indicator lamp
//   circuit analysis (brightness)  → LED emissive intensity
//   libraryState.neopixels         → NeoPixel emissive color + intensity
//   libraryState.custom (signals)  → assembly-body joints + emissive via bindings
//   GLB baked clips                → AnimationMixer for bodies with playAnimations
//
// The canvas runs frameloop="demand": data changes nudge one frame via
// invalidate(), and the loop keeps requesting frames only while something is
// still moving (servo mid-slew, motor spinning, a clip playing).

import { useEffect, useMemo, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { MathUtils, Vector3 } from "three"
import type { AssemblyBinding, LibraryState, PinState } from "@dreamer/schemas"
import { isJointBindingChannel } from "@dreamer/schemas"
import type { CircuitAnalysis } from "@/simulator/circuit-solver"
import { useBoardSelector } from "@/store/board-context"
import { useCircuitAnalysis } from "@/simulator/circuit-analysis-hook"
import { usePinStates } from "@/simulator/use-pin-state"
import { findArduinoPinForComponentPin } from "@/breadboard/component-pin-resolver"
import { useAssemblyDoc } from "./use-assembly"
import {
  getBodyJoint,
  getBodyMaterials,
  getBodyMixer,
  getPartNodes,
  SEVEN_SEGMENT_ORDER,
} from "./scene-registry"

/** SG90 no-load speed is ~600°/s; a loaded horn is slower. */
const SERVO_DEG_PER_SEC = 400
/** Visual shaft speed at the peripheral's full rotor speed (~2 rev/s). The
 *  ramp itself is NOT here — DcMotorPeripheral owns the inertia. */
const MOTOR_FULL_SPEED_RAD_PER_SEC = 2 * Math.PI * 2
/** Emissive intensity at full brightness — >1 reads as "lit" under the scene lights. */
const EMISSIVE_MAX = 2

/** Read a bound signal: a servo's live angle or a custom-DSL behavior signal. */
function readSignal(libraryState: LibraryState, binding: AssemblyBinding): number {
  if (binding.signal === "angle" && libraryState.servos[binding.componentId]) {
    return libraryState.servos[binding.componentId].angle
  }
  return libraryState.custom[binding.componentId]?.[binding.signal] ?? 0
}

/** Per-channel brightness (0..1) off a pin, mirroring the 2D RGB LED renderer:
 *  PWM duty when the pin is analog-written, else the digital level. */
function channelBrightness(pin: number | null, pinStates: PinState[]): number {
  if (pin === null) return 0
  const state = pinStates[pin]
  if (!state) return 0
  return state.isPwm ? state.pwmValue / 255 : state.digitalValue
}

/** An RGB LED's three colour pins, resolved from the wire graph once (not per
 *  frame). null when a channel isn't wired to a driver pin. */
type RgbLedPins = { id: string; red: number | null; green: number | null; blue: number | null }

/** A 7-segment display's 8 segment pins, resolved from the wire graph once, in
 *  {@link SEVEN_SEGMENT_ORDER} so index i lights segmentMaterials[i].
 *  anode = common-anode wiring (a segment lights when its pin is driven LOW). */
type SevenSegPins = { id: string; pins: (number | null)[]; anode: boolean }

export function AnimationDriver() {
  const libraryState = useBoardSelector((ctx) => ctx.libraryState)
  const components = useBoardSelector((ctx) => ctx.components)
  const wires = useBoardSelector((ctx) => ctx.wires)
  const { analysis } = useCircuitAnalysis()
  const pinStates = usePinStates()
  const assembly = useAssemblyDoc()
  const invalidate = useThree((state) => state.invalidate)

  // Resolve each RGB LED's colour pins from the wire graph. The mapping only
  // changes when parts/wires change, so keep it out of the frame loop; the
  // per-frame work is just reading pinStates at those indices.
  const rgbLeds = useMemo<RgbLedPins[]>(() => {
    const out: RgbLedPins[] = []
    for (const c of Object.values(components)) {
      if (c.type !== "rgb_led") continue
      out.push({
        id: c.id,
        red: findArduinoPinForComponentPin(c, "red", wires),
        green: findArduinoPinForComponentPin(c, "green", wires),
        blue: findArduinoPinForComponentPin(c, "blue", wires),
      })
    }
    return out
  }, [components, wires])
  // Ids to skip in the generic emissive loop, so it doesn't clobber the RGB
  // branch's colour back to red-channel-only brightness every frame.
  const rgbLedIds = useMemo(() => new Set(rgbLeds.map((r) => r.id)), [rgbLeds])

  // LCD component ids (there's one live LCD state, but the panel is per-part).
  const lcdIds = useMemo(
    () => Object.values(components).filter((c) => c.type === "lcd_16x2").map((c) => c.id),
    [components],
  )

  // OLED component ids — each has its own SSD1306 framebuffer in libraryState.oled.
  const oledIds = useMemo(
    () => Object.values(components).filter((c) => c.type === "oled_display").map((c) => c.id),
    [components],
  )

  // Each 7-segment display's segment pins, resolved from the wire graph. Like
  // the RGB LED mapping, this only changes when parts/wires change; per frame we
  // just read pinStates at these indices.
  const sevenSegs = useMemo<SevenSegPins[]>(() => {
    const out: SevenSegPins[] = []
    for (const c of Object.values(components)) {
      if (c.type !== "seven_segment") continue
      out.push({
        id: c.id,
        pins: SEVEN_SEGMENT_ORDER.map((seg) => findArduinoPinForComponentPin(c, seg, wires)),
        anode: c.properties.commonType === "anode",
      })
    }
    return out
  }, [components, wires])

  // Latest sim data for the frame loop, without re-subscribing useFrame.
  const dataRef = useRef<{
    libraryState: LibraryState
    analysis: CircuitAnalysis | null
    assembly: typeof assembly
    pinStates: PinState[]
    rgbLeds: RgbLedPins[]
    rgbLedIds: Set<string>
    lcdIds: string[]
    oledIds: string[]
    sevenSegs: SevenSegPins[]
  }>({ libraryState, analysis, assembly, pinStates, rgbLeds, rgbLedIds, lcdIds, oledIds, sevenSegs })
  dataRef.current = { libraryState, analysis, assembly, pinStates, rgbLeds, rgbLedIds, lcdIds, oledIds, sevenSegs }

  // Last LCD state painted onto each panel, so the frame loop only repaints the
  // texture when the buffer actually changes (not every animating frame).
  const lastLcd = useRef(new Map<string, LibraryState["lcd"]>())
  // Last OLED state painted per panel, so we only redraw when its framebuffer
  // reference actually changes (the peripheral hands out a fresh object on flush).
  const lastOled = useRef(new Map<string, LibraryState["oled"][string] | undefined>())

  // Demand frameloop: nudge a frame whenever sim data changes. pinStates is in
  // here so an RGB LED's green/blue-only pin change still repaints; lcdIds so a
  // newly-mounted LCD panel paints the current buffer.
  useEffect(() => {
    invalidate()
  }, [libraryState, analysis, assembly, pinStates, rgbLeds, lcdIds, oledIds, sevenSegs, invalidate])

  const axisScratch = useRef(new Vector3())

  useFrame((_, rawDelta) => {
    // A background tab can accumulate a huge delta; clamp so motion stays sane.
    const delta = Math.min(rawDelta, 0.1)
    const data = dataRef.current
    let animating = false

    // Servos → horn angle, rate-limited toward the commanded angle. 90° is
    // neutral (horn centered). A real servo travels at a roughly constant
    // speed and stops, rather than easing in exponentially.
    const maxServoStep = MathUtils.degToRad(SERVO_DEG_PER_SEC) * delta
    for (const [componentId, servo] of Object.entries(data.libraryState.servos)) {
      const node = getPartNodes(componentId)?.angleNode
      if (!node) continue
      const target = MathUtils.degToRad(servo.angle - 90)
      const diff = target - node.rotation.y
      if (Math.abs(diff) <= maxServoStep) {
        node.rotation.y = target
      } else {
        node.rotation.y += Math.sign(diff) * maxServoStep
        animating = true
      }
    }

    // Steppers → rotate the output shaft to the sim's accumulated rotor angle.
    // The peripheral already produces a smooth, direction-correct angle, so we
    // track it directly (no rate-limit). angleNode is spun about its local Y.
    for (const [componentId, stepper] of Object.entries(data.libraryState.steppers)) {
      const node = getPartNodes(componentId)?.angleNode
      if (!node) continue
      const target = MathUtils.degToRad(stepper.angle)
      if (Math.abs(node.rotation.y - target) > 1e-4) {
        node.rotation.y = target
        animating = true
      }
    }

    // Character LCD → repaint the 3D panel when the HD44780 buffer changes.
    // libraryState.lcd is a fresh object on each mutation, so a reference check
    // skips the (cheap but not free) canvas redraw on idle frames.
    for (const id of data.lcdIds) {
      const screen = getPartNodes(id)?.lcdScreen
      if (!screen) continue
      if (lastLcd.current.get(id) === data.libraryState.lcd) continue
      lastLcd.current.set(id, data.libraryState.lcd)
      screen.paint(data.libraryState.lcd)
    }

    // SSD1306 OLED → repaint the 3D panel when its framebuffer changes. Each OLED
    // has its own state entry; the peripheral swaps in a fresh object on flush, so
    // a reference check skips the redraw on idle frames.
    for (const id of data.oledIds) {
      const screen = getPartNodes(id)?.oledScreen
      if (!screen) continue
      const oled = data.libraryState.oled[id]
      if (lastOled.current.get(id) === oled) continue
      lastOled.current.set(id, oled)
      screen.paint(oled ?? null)
    }

    // DC motor shafts. The rotor model lives in DcMotorPeripheral — it already
    // carries the spin-up/coast-down time constant, the power gate, and the
    // back-EMF that feeds the netlist. Re-deriving speed from solved voltage
    // here (as this used to) meant two inertia models with different time
    // constants that disagreed on spin-up and on brownout; the visual now just
    // reflects the one the circuit is actually solved against.
    for (const [componentId, motor] of Object.entries(data.libraryState.motors)) {
      const node = getPartNodes(componentId)?.spinNode
      if (!node) continue
      if (Math.abs(motor.speed) > 1e-3) {
        node.rotation.y += motor.speed * MOTOR_FULL_SPEED_RAD_PER_SEC * delta
        animating = true
      }
    }

    // Relay coil lamps. The armature is sealed inside the can and can never be
    // seen, so the indicator LED is the honest visual — and because it follows
    // `energized` rather than the drive pin, it inherits the peripheral's
    // pull-in / drop-out delay instead of snapping on the GPIO edge.
    for (const [componentId, relay] of Object.entries(data.libraryState.relays)) {
      const material = getPartNodes(componentId)?.indicatorMaterial
      if (!material) continue
      const lit = relay.energized ? EMISSIVE_MAX : 0
      if (Math.abs(material.emissiveIntensity - lit) > 0.01) {
        material.emissiveIntensity = lit
        animating = true
      }
    }

    // Solved electrical states → LED emissive.
    if (data.analysis) {
      for (const [componentId, state] of data.analysis.componentStates) {
        const nodes = getPartNodes(componentId)
        if (!nodes) continue
        // RGB LEDs are driven per-channel below; skip them here so the generic
        // (red-current-only) brightness doesn't fight the colour branch.
        if (nodes.emissiveMaterial && !data.rgbLedIds.has(componentId)) {
          const lit = Math.max(0, Math.min(1, state.brightness)) * EMISSIVE_MAX
          if (Math.abs(nodes.emissiveMaterial.emissiveIntensity - lit) > 0.01) {
            nodes.emissiveMaterial.emissiveIntensity = lit
            animating = true
          }
        }
      }
    }

    // NeoPixels → emissive color + intensity from the brightest lit pixel, so
    // the single 3D block glows whenever any pixel on the strip is on (a moving
    // dot / chase would otherwise look dark whenever pixel 0 is off).
    for (const [componentId, neo] of Object.entries(data.libraryState.neopixels)) {
      const material = getPartNodes(componentId)?.emissiveMaterial
      if (!material || neo.pixels.length === 0) continue
      let r = 0
      let g = 0
      let b = 0
      for (const p of neo.pixels) {
        if (p.r + p.g + p.b > r + g + b) {
          r = p.r
          g = p.g
          b = p.b
        }
      }
      const intensity = (Math.max(r, g, b) / 255) * EMISSIVE_MAX
      material.emissive.setRGB(r / 255, g / 255, b / 255)
      if (Math.abs(material.emissiveIntensity - intensity) > 0.01) {
        material.emissiveIntensity = intensity
        animating = true
      }
    }

    // RGB LEDs → emissive colour mixed from the three driver pins (PWM/digital),
    // matching the 2D renderer. Hue is normalised to full scale so a dim red
    // still reads red, and intensity carries the brightness.
    for (const rgb of data.rgbLeds) {
      const material = getPartNodes(rgb.id)?.emissiveMaterial
      if (!material) continue
      const rBright = channelBrightness(rgb.red, data.pinStates)
      const gBright = channelBrightness(rgb.green, data.pinStates)
      const bBright = channelBrightness(rgb.blue, data.pinStates)
      const maxCh = Math.max(rBright, gBright, bBright)
      const hueScale = maxCh > 0 ? 1 / maxCh : 0
      material.emissive.setRGB(rBright * hueScale, gBright * hueScale, bBright * hueScale)
      const intensity = maxCh * EMISSIVE_MAX
      if (Math.abs(material.emissiveIntensity - intensity) > 0.01) {
        material.emissiveIntensity = intensity
        animating = true
      }
    }

    // 7-segment displays → light each segment from its driver pin. Common
    // cathode (default): a segment lights when its pin is HIGH; common anode:
    // when LOW. An unwired segment (null pin) stays dark either way. The
    // procedural model exposes `segmentMaterials` (emissive bars); the GLB module
    // exposes `sevenSegScreen` (a painted overlay) — drive whichever is present.
    for (const seg of data.sevenSegs) {
      const partNodes = getPartNodes(seg.id)
      const materials = partNodes?.segmentMaterials
      const screen = partNodes?.sevenSegScreen
      if (!materials && !screen) continue
      const levels: number[] = []
      for (let i = 0; i < SEVEN_SEGMENT_ORDER.length; i++) {
        const pin = seg.pins[i]
        const level = channelBrightness(pin, data.pinStates)
        const on = pin === null ? 0 : seg.anode ? 1 - level : level
        levels.push(on)
        if (materials) {
          const lit = on * EMISSIVE_MAX
          if (Math.abs(materials[i].emissiveIntensity - lit) > 0.01) {
            materials[i].emissiveIntensity = lit
            animating = true
          }
        }
      }
      if (screen && screen.paint(levels)) animating = true
    }

    // Assembly bindings: component signals → uploaded-body joints + emissive.
    for (const binding of data.assembly.bindings) {
      const body = data.assembly.bodies[binding.bodyId]
      if (!body) continue
      const value = readSignal(data.libraryState, binding) * binding.map.scale + binding.map.offset

      if (binding.channel === "emissive") {
        const materials = getBodyMaterials(binding.bodyId)
        if (!materials) continue
        const lit = Math.max(0, Math.min(1, value)) * EMISSIVE_MAX
        for (const material of materials) {
          if (Math.abs(material.emissiveIntensity - lit) > 0.01) {
            material.emissiveIntensity = lit
            animating = true
          }
        }
        continue
      }

      if (!isJointBindingChannel(binding.channel) || !body.joint) continue
      const joint = getBodyJoint(binding.bodyId)
      if (!joint) continue
      const axis = axisScratch.current
        .set(body.joint.axis[0], body.joint.axis[1], body.joint.axis[2])
        .normalize()
      if (body.joint.kind === "slide") {
        // value is millimeters along the axis.
        joint.position.set(axis.x * value, axis.y * value, axis.z * value)
      } else {
        // value is degrees around the axis.
        joint.quaternion.setFromAxisAngle(axis, MathUtils.degToRad(value))
      }
    }

    // GLB baked clips: advance the mixer for every body that opted in.
    for (const body of Object.values(data.assembly.bodies)) {
      if (!body.playAnimations) continue
      const mixer = getBodyMixer(body.id)
      if (!mixer) continue
      mixer.update(delta)
      animating = true
    }

    if (animating) invalidate()
  })

  return null
}
