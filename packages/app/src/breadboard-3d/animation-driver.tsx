// ── Signal-driven animation loop ────────────────────────────────────────────
//
// One useFrame loop drives every animated node in the 3D scene from live
// simulator state, imperatively — sim values never flow through React state
// on their way to a transform. Sources:
//
//   libraryState.servos            → servo horn angle (rate-limited like a real SG90)
//   circuit analysis (voltage)     → DC motor shaft spin (with spin-up/down inertia)
//   circuit analysis (brightness)  → LED emissive intensity
//   libraryState.neopixels         → NeoPixel emissive color + intensity
//   libraryState.custom (signals)  → assembly-body joints + emissive via bindings
//   GLB baked clips                → AnimationMixer for bodies with playAnimations
//
// The canvas runs frameloop="demand": data changes nudge one frame via
// invalidate(), and the loop keeps requesting frames only while something is
// still moving (servo mid-slew, motor spinning, a clip playing).

import { useEffect, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { MathUtils, Vector3 } from "three"
import type { AssemblyBinding, LibraryState } from "@dreamer/schemas"
import { isJointBindingChannel } from "@dreamer/schemas"
import type { CircuitAnalysis } from "@/simulator/circuit-solver"
import { useBoardSelector } from "@/store/board-context"
import { useCircuitAnalysis } from "@/simulator/circuit-analysis-hook"
import { useAssemblyDoc } from "./use-assembly"
import {
  getBodyJoint,
  getBodyMaterials,
  getBodyMixer,
  getPartNodes,
} from "./scene-registry"

/** SG90 no-load speed is ~600°/s; a loaded horn is slower. */
const SERVO_DEG_PER_SEC = 400
/** Visual shaft speed: ~2 rev/s at a full 5 V. */
const MOTOR_RAD_PER_SEC_PER_VOLT = (2 * Math.PI * 2) / 5
/** First-order spin-up / coast-down time constant of a small hobby motor (s). */
const MOTOR_SPINUP_TAU = 0.3
/** Emissive intensity at full brightness — >1 reads as "lit" under the scene lights. */
const EMISSIVE_MAX = 2

/** Read a bound signal: a servo's live angle or a custom-DSL behavior signal. */
function readSignal(libraryState: LibraryState, binding: AssemblyBinding): number {
  if (binding.signal === "angle" && libraryState.servos[binding.componentId]) {
    return libraryState.servos[binding.componentId].angle
  }
  return libraryState.custom[binding.componentId]?.[binding.signal] ?? 0
}

export function AnimationDriver() {
  const libraryState = useBoardSelector((ctx) => ctx.libraryState)
  const { analysis } = useCircuitAnalysis()
  const assembly = useAssemblyDoc()
  const invalidate = useThree((state) => state.invalidate)

  // Latest sim data for the frame loop, without re-subscribing useFrame.
  const dataRef = useRef<{
    libraryState: LibraryState
    analysis: CircuitAnalysis | null
    assembly: typeof assembly
  }>({ libraryState, analysis, assembly })
  dataRef.current = { libraryState, analysis, assembly }

  // Demand frameloop: nudge a frame whenever sim data changes.
  useEffect(() => {
    invalidate()
  }, [libraryState, analysis, assembly, invalidate])

  const axisScratch = useRef(new Vector3())
  // Per-motor current angular velocity (rad/s), ramped toward target for inertia.
  const motorOmega = useRef(new Map<string, number>())

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

    // Solved electrical states → motor spin (with inertia) + LED emissive.
    if (data.analysis) {
      for (const [componentId, state] of data.analysis.componentStates) {
        const nodes = getPartNodes(componentId)
        if (!nodes) continue
        if (nodes.spinNode) {
          const targetOmega =
            state.isActive && state.voltage > 0.3
              ? (state.isReversed ? -1 : 1) * state.voltage * MOTOR_RAD_PER_SEC_PER_VOLT
              : 0
          const current = motorOmega.current.get(componentId) ?? 0
          // First-order ramp toward the target speed: spin-up and coast-down
          // both lag, so the shaft doesn't snap to speed or stop dead.
          const blend = 1 - Math.exp(-delta / MOTOR_SPINUP_TAU)
          const next = current + (targetOmega - current) * blend
          motorOmega.current.set(componentId, next)
          if (Math.abs(next) > 1e-3) {
            nodes.spinNode.rotation.y += next * delta
            animating = true
          }
        }
        if (nodes.emissiveMaterial) {
          const lit = Math.max(0, Math.min(1, state.brightness)) * EMISSIVE_MAX
          if (Math.abs(nodes.emissiveMaterial.emissiveIntensity - lit) > 0.01) {
            nodes.emissiveMaterial.emissiveIntensity = lit
            animating = true
          }
        }
      }
    }

    // NeoPixels → emissive color + intensity from the first pixel.
    for (const [componentId, neo] of Object.entries(data.libraryState.neopixels)) {
      const material = getPartNodes(componentId)?.emissiveMaterial
      const pixel = neo.pixels[0]
      if (!material || !pixel) continue
      const intensity = (Math.max(pixel.r, pixel.g, pixel.b) / 255) * EMISSIVE_MAX
      material.emissive.setRGB(pixel.r / 255, pixel.g / 255, pixel.b / 255)
      if (Math.abs(material.emissiveIntensity - intensity) > 0.01) {
        material.emissiveIntensity = intensity
        animating = true
      }
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
