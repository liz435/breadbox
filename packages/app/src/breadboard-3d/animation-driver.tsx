// ── Signal-driven animation loop ────────────────────────────────────────────
//
// One useFrame loop drives every animated node in the 3D scene from live
// simulator state, imperatively — sim values never flow through React state
// on their way to a transform. Sources:
//
//   libraryState.servos            → servo horn angle (slew-limited like a real SG90)
//   circuit analysis (voltage)     → DC motor shaft spin
//   circuit analysis (brightness)  → LED emissive intensity
//   libraryState.neopixels         → NeoPixel emissive color + intensity
//   libraryState.custom (signals)  → assembly-body joints via bindings
//
// The canvas runs frameloop="demand": data changes nudge one frame via
// invalidate(), and the loop keeps requesting frames only while something is
// still moving (servo mid-slew, motor spinning).

import { useEffect, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { MathUtils, Vector3 } from "three"
import { easing } from "maath"
import { useBoardSelector } from "@/store/board-context"
import { useCircuitAnalysis } from "@/simulator/circuit-analysis-hook"
import { useAssemblyDoc } from "./use-assembly"
import { getBodyJoint, getPartNodes } from "./scene-registry"

/** ≈ SG90 slew feel (60° in ~150 ms with damping tail). */
const SERVO_SMOOTH_TIME = 0.08
/** Visual shaft speed: ~2 rev/s at a full 5 V. */
const MOTOR_RAD_PER_SEC_PER_VOLT = (2 * Math.PI * 2) / 5
/** Emissive intensity at full brightness — >1 reads as "lit" under the scene lights. */
const EMISSIVE_MAX = 2

export function AnimationDriver() {
  const libraryState = useBoardSelector((ctx) => ctx.libraryState)
  const { analysis } = useCircuitAnalysis()
  const assembly = useAssemblyDoc()
  const invalidate = useThree((state) => state.invalidate)

  // Latest sim data for the frame loop, without re-subscribing useFrame.
  const dataRef = useRef({ libraryState, analysis, assembly })
  dataRef.current = { libraryState, analysis, assembly }

  // Demand frameloop: nudge a frame whenever sim data changes.
  useEffect(() => {
    invalidate()
  }, [libraryState, analysis, assembly, invalidate])

  const axisScratch = useRef(new Vector3())

  useFrame((_, rawDelta) => {
    // A background tab can accumulate a huge delta; clamp so motion stays sane.
    const delta = Math.min(rawDelta, 0.1)
    const data = dataRef.current
    let animating = false

    // Servos → horn angle, slew-limited. 90° is the neutral (horn centered).
    for (const [componentId, servo] of Object.entries(data.libraryState.servos)) {
      const node = getPartNodes(componentId)?.angleNode
      if (!node) continue
      const target = MathUtils.degToRad(servo.angle - 90)
      if (easing.damp(node.rotation, "y", target, SERVO_SMOOTH_TIME, delta)) {
        animating = true
      }
    }

    // Solved electrical states → motor spin + LED emissive.
    if (data.analysis) {
      for (const [componentId, state] of data.analysis.componentStates) {
        const nodes = getPartNodes(componentId)
        if (!nodes) continue
        if (nodes.spinNode && state.isActive && state.voltage > 0.3) {
          const direction = state.isReversed ? -1 : 1
          nodes.spinNode.rotation.y +=
            direction * state.voltage * MOTOR_RAD_PER_SEC_PER_VOLT * delta
          animating = true
        }
        if (nodes.emissiveMaterial) {
          const next = Math.max(0, Math.min(1, state.brightness)) * EMISSIVE_MAX
          if (Math.abs(nodes.emissiveMaterial.emissiveIntensity - next) > 0.01) {
            nodes.emissiveMaterial.emissiveIntensity = next
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

    // Assembly bindings: component signals → uploaded-body joints.
    for (const binding of data.assembly.bindings) {
      const body = data.assembly.bodies[binding.bodyId]
      const joint = getBodyJoint(binding.bodyId)
      if (!body?.joint || !joint || binding.channel !== "rotate") continue
      // "angle" reads the built-in servo peripheral; anything else is a
      // custom-DSL behavior signal published under libraryState.custom.
      const value =
        binding.signal === "angle" && data.libraryState.servos[binding.componentId]
          ? data.libraryState.servos[binding.componentId].angle
          : (data.libraryState.custom[binding.componentId]?.[binding.signal] ?? 0)
      const degrees = value * binding.map.scale + binding.map.offset
      const axis = axisScratch.current
        .set(body.joint.axis[0], body.joint.axis[1], body.joint.axis[2])
        .normalize()
      joint.quaternion.setFromAxisAngle(axis, MathUtils.degToRad(degrees))
    }

    if (animating) invalidate()
  })

  return null
}
