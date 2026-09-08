import RAPIER from '@dimforge/rapier3d-compat'
import { physicalSceneSchema } from '@dreamer/schemas'
import type { PhysicalScene, PhysicalCollider, PhysicalJoint, PhysicalActuator } from '@dreamer/schemas'
import type { Quat, Vec3 } from './math'
import { clamp, conjugate, cross, dot, fromEuler, fromTuple, identity, mmToM, mToMm, multiply, normalize, pointInWorld, rotate, scale, sub, twistAngle, wrapAngle } from './math'

export type PhysicalCommand = { actuatorId: string; target: number }
export type PhysicalSnapshot = {
  /** Simulated seconds, independent of rendering and wall-clock time. */
  time: number
  bodies: Record<string, { position: Vec3; rotation: Quat }>
  /** Revolute: rad, rad/s. Prismatic: mm, mm/s. */
  joints: Record<string, { position: number; velocity: number }>
  actuators: Record<string, { actual: number; target: number; error: number; effort: number }>
  sensors: Record<string, { active: boolean; distanceMm: number | null }>
}

// All concurrent runtimes share WASM initialization, but never a world.
let initialization: Promise<void> | undefined

export type TimedPhysicalCommand = PhysicalCommand & { time: number }
type Drag = { bodyId: string; localPoint: Vec3; target: Vec3; maxForce: number }
type BodyState = { body: RAPIER.RigidBody; basis: Quat; colliders: RAPIER.Collider[] }
type JointState = { definition: PhysicalJoint; a: BodyState; b: BodyState; axis: Vec3;
  anchorA: Vec3; anchorB: Vec3; previousAngle: number; position: number; velocity: number }
type ActuatorState = { definition: PhysicalActuator; joint: JointState; target: number; effort: number }

function colliderDescription(collider: PhysicalCollider): RAPIER.ColliderDesc {
  switch (collider.shape) {
    case 'box': return RAPIER.ColliderDesc.cuboid(collider.size[0] / 2000, collider.size[1] / 2000, collider.size[2] / 2000)
    case 'sphere': return RAPIER.ColliderDesc.ball(collider.radius / 1000)
    case 'capsule': return RAPIER.ColliderDesc.capsule(collider.halfHeight / 1000, collider.radius / 1000)
  }
}

function colliderVolume(collider: PhysicalCollider): number {
  switch (collider.shape) {
    case 'box': return collider.size[0] * collider.size[1] * collider.size[2]
    case 'sphere': return 4 / 3 * Math.PI * collider.radius ** 3
    case 'capsule': return Math.PI * collider.radius ** 2 * 2 * collider.halfHeight + 4 / 3 * Math.PI * collider.radius ** 3
  }
}

/** Headless, fixed-tick SI physics. The caller owns start/pause and wall-clock scheduling.
 * Neither commands nor dragging ever set a dynamic body's transform or velocity.
 */
export class PhysicalRuntime {
  readonly timestep: number
  private world: RAPIER.World
  private readonly scene: PhysicalScene
  private readonly bodies = new Map<string, BodyState>()
  private readonly joints = new Map<string, JointState>()
  private readonly actuators = new Map<string, ActuatorState>()
  private sensorValues: PhysicalSnapshot['sensors'] = {}
  private ticks = 0
  private disposed = false
  private drag: Drag | undefined

  static async create(scene: PhysicalScene): Promise<PhysicalRuntime> {
    // Parse before allocating WASM; parsing also clones the frozen initial document.
    const initial = physicalSceneSchema.parse(scene)
    initialization ??= RAPIER.init().catch((error: unknown) => {
      initialization = undefined
      throw error
    })
    await initialization
    return new PhysicalRuntime(initial)
  }

  private constructor(scene: PhysicalScene) {
    this.scene = scene
    this.timestep = scene.fixedTimeStep
    this.world = new RAPIER.World(fromTuple(scene.gravity))
    try { this.build() } catch (error) { this.world.free(); throw error }
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('Physical runtime has been disposed')
  }

  private build(): void {
    this.world.timestep = this.timestep
    this.world.integrationParameters.numSolverIterations = 12
    this.world.integrationParameters.normalizedAllowedLinearError = 0.0001
    this.world.integrationParameters.maxCcdSubsteps = 4
    for (const definition of Object.values(this.scene.bodies)) {
      const descriptor = definition.kind === 'dynamic' ? RAPIER.RigidBodyDesc.dynamic()
        : definition.kind === 'fixed' ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.kinematicPositionBased()
      const position = mmToM(fromTuple(definition.position))
      descriptor.setTranslation(position.x, position.y, position.z).setCcdEnabled(definition.kind === 'dynamic')
      const body = this.world.createRigidBody(descriptor)
      const basis = fromEuler(definition.rotation)
      // Rapier 0.19's revolute/prismatic constructors accept one shared local axis.
      // Use initially world-aligned internal body frames; bake the authored basis
      // into colliders/anchors and restore it when publishing poses.
      const totalVolume = definition.colliders.reduce((sum, collider) => sum + colliderVolume(collider), 0)
      const colliders = definition.colliders.map((collider) => {
        const offset = rotate(basis, mmToM(fromTuple(collider.offset)))
        const desc = colliderDescription(collider)
          .setTranslation(offset.x, offset.y, offset.z)
          .setRotation(multiply(basis, fromEuler(collider.rotation)))
          .setMass(definition.mass * colliderVolume(collider) / totalVolume)
          .setFriction(collider.friction).setRestitution(collider.restitution)
        return this.world.createCollider(desc, body)
      })
      body.recomputeMassPropertiesFromColliders()
      this.bodies.set(definition.id, { body, basis, colliders })
    }
    for (const definition of Object.values(this.scene.joints)) {
      const a = requireEntry(this.bodies, definition.bodyA, 'body')
      const b = requireEntry(this.bodies, definition.bodyB, 'body')
      const anchorA = rotate(a.basis, mmToM(fromTuple(definition.anchorA)))
      const anchorB = rotate(b.basis, mmToM(fromTuple(definition.anchorB)))
      const axis = normalize(rotate(a.basis, fromTuple(definition.axis)))
      const desc = definition.kind === 'fixed' ? RAPIER.JointData.fixed(anchorA, identity, anchorB, identity)
        : definition.kind === 'revolute' ? RAPIER.JointData.revolute(anchorA, anchorB, axis)
          : RAPIER.JointData.prismatic(anchorA, anchorB, axis)
      if (definition.limits) {
        const unit = definition.kind === 'prismatic' ? 0.001 : 1
        desc.limitsEnabled = true
        desc.limits = [definition.limits.min * unit, definition.limits.max * unit]
      }
      const joint = this.world.createImpulseJoint(desc, a.body, b.body, true)
      // Only directly connected bodies are filtered, never obstacles or other links.
      joint.setContactsEnabled(false)
      this.joints.set(definition.id, { definition, a, b, axis, anchorA, anchorB, previousAngle: 0, position: 0, velocity: 0 })
    }
    this.measureJoints()
    for (const definition of Object.values(this.scene.actuators)) {
      const joint = requireEntry(this.joints, definition.jointId, 'joint')
      if (!joint.a.body.isDynamic() && !joint.b.body.isDynamic()) {
        throw new Error(`Actuator ${definition.id} needs a dynamic body`)
      }
      this.actuators.set(definition.id, { definition, joint, target: definition.target, effort: 0 })
    }
    this.world.propagateModifiedBodyPositionsToColliders()
    this.measureSensors()
  }

  command(actuatorId: string, target: number): void {
    this.assertAlive()
    const actuator = requireEntry(this.actuators, actuatorId, 'actuator')
    actuator.target = finite(target, 'Actuator target')
  }

  step(commands: readonly PhysicalCommand[] = []): PhysicalSnapshot {
    this.assertAlive()
    // Validate the whole batch before applying any of it.
    for (const command of commands) {
      requireEntry(this.actuators, command.actuatorId, 'actuator')
      finite(command.target, 'Actuator target')
    }
    for (const command of commands) this.command(command.actuatorId, command.target)
    for (const { body } of this.bodies.values()) {
      body.resetForces(false)
      body.resetTorques(false)
    }
    for (const actuator of this.actuators.values()) this.drive(actuator)
    this.applyDrag()
    this.world.step()
    this.ticks++
    this.measureJoints()
    this.measureSensors()
    return this.snapshot()
  }

  private measureJoints(): void {
    for (const state of this.joints.values()) {
      const { a, b, axis, definition } = state
      const worldAxis = rotate(a.body.rotation(), axis)
      if (definition.kind === 'revolute') {
        const relative = multiply(conjugate(a.body.rotation()), b.body.rotation())
        const angle = twistAngle(relative, axis)
        state.position += wrapAngle(angle - state.previousAngle)
        state.previousAngle = angle
        state.velocity = dot(sub(b.body.angvel(), a.body.angvel()), worldAxis)
      } else if (definition.kind === 'prismatic') {
        const pointA = pointInWorld(a.body.translation(), a.body.rotation(), state.anchorA)
        const pointB = pointInWorld(b.body.translation(), b.body.rotation(), state.anchorB)
        const delta = sub(pointB, pointA)
        state.position = dot(delta, worldAxis) * 1000
        // Include the rotating reference axis in the coordinate derivative.
        state.velocity = (dot(sub(b.body.velocityAtPoint(pointB), a.body.velocityAtPoint(pointA)), worldAxis)
          + dot(delta, cross(a.body.angvel(), worldAxis))) * 1000
      }
    }
  }

  private drive(state: ActuatorState): void {
    const { definition, joint } = state
    const unit = joint.definition.kind === 'prismatic' ? 0.001 : 1
    const velocity = joint.velocity * unit
    const maxSpeed = definition.speedLimit * unit
    let effort: number
    if (definition.kind === 'dc') {
      // Simplified velocity controller; kp has units N/(m/s) or N·m/(rad/s).
      effort = definition.kp * (clamp(state.target * unit, -maxSpeed, maxSpeed) - velocity)
    } else {
      const error = (state.target - joint.position) * unit
      // PD with bounded desired speed. At low error this is exactly kp*e-kd*v.
      const proportional = definition.kp * error
      effort = (definition.kd > 0 ? clamp(proportional, -definition.kd * maxSpeed, definition.kd * maxSpeed) : proportional)
        - definition.kd * velocity
      if (Math.abs(velocity) >= maxSpeed && effort * velocity > 0) effort = 0
    }
    state.effort = clamp(effort, -definition.maxForce, definition.maxForce)
    const force = scale(rotate(joint.a.body.rotation(), joint.axis), state.effort)
    if (joint.definition.kind === 'revolute') {
      joint.b.body.addTorque(force, true)
      joint.a.body.addTorque(scale(force, -1), true)
    } else {
      const a = pointInWorld(joint.a.body.translation(), joint.a.body.rotation(), joint.anchorA)
      const b = pointInWorld(joint.b.body.translation(), joint.b.body.rotation(), joint.anchorB)
      joint.b.body.addForceAtPoint(force, b, true)
      joint.a.body.addForceAtPoint(scale(force, -1), a, true)
    }
  }

  private measureSensors(): void {
    const values: PhysicalSnapshot['sensors'] = {}
    for (const sensor of Object.values(this.scene.sensors)) {
      const mounted = requireEntry(this.bodies, sensor.bodyId, 'body')
      const rotation = multiply(mounted.body.rotation(), mounted.basis)
      const origin = pointInWorld(mounted.body.translation(), rotation, mmToM(fromTuple(sensor.origin)))
      const direction = normalize(rotate(rotation, fromTuple(sensor.direction)))
      const ray = new RAPIER.Ray(origin, direction)
      const probe = new RAPIER.Ball(sensor.range / 1000)
      let distance: number | null = null
      let active = false
      // Direct collider queries also work before the first physics tick (Rapier's
      // broadphase is populated by step). Every collider on the mount is excluded.
      for (const [bodyId, body] of this.bodies) {
        if (bodyId === sensor.bodyId) continue
        for (const collider of body.colliders) {
          if (sensor.kind === 'contact') {
            active ||= collider.intersectsShape(probe, origin, identity)
          } else {
            const hit = collider.castRay(ray, sensor.range / 1000, true)
            if (hit >= 0 && (distance === null || hit * 1000 < distance)) distance = hit * 1000
          }
        }
      }
      values[sensor.id] = { active: sensor.kind === 'distance' ? distance !== null : active, distanceMm: distance }
    }
    this.sensorValues = values
  }

  snapshot(): PhysicalSnapshot {
    this.assertAlive()
    const bodies: PhysicalSnapshot['bodies'] = {}
    const joints: PhysicalSnapshot['joints'] = {}
    const actuators: PhysicalSnapshot['actuators'] = {}
    for (const [id, state] of this.bodies) {
      bodies[id] = { position: mToMm(state.body.translation()), rotation: multiply(state.body.rotation(), state.basis) }
    }
    for (const [id, state] of this.joints) joints[id] = { position: state.position, velocity: state.velocity }
    for (const [id, state] of this.actuators) {
      const actual = state.definition.kind === 'dc' ? state.joint.velocity : state.joint.position
      actuators[id] = { actual, target: state.target, error: state.target - actual, effort: state.effort }
    }
    return { time: this.ticks * this.timestep, bodies, joints, actuators, sensors: structuredClone(this.sensorValues) }
  }

  /** A bounded damped spring at an authored body-local point; lengths are mm. */
  setDrag(bodyId: string, localPointMm: Vec3, targetWorldMm: Vec3, maxForceN = 20): void {
    this.assertAlive()
    const state = requireEntry(this.bodies, bodyId, 'body')
    if (!state.body.isDynamic()) throw new Error('Only dynamic bodies can be force-dragged')
    if (finite(maxForceN, 'Drag maximum force') < 0) throw new Error('Drag maximum force must be nonnegative')
    this.drag = { bodyId, localPoint: rotate(state.basis, mmToM(finiteVector(localPointMm, 'Drag local point'))),
      target: mmToM(finiteVector(targetWorldMm, 'Drag target')), maxForce: maxForceN }
  }

  clearDrag(): void { this.assertAlive(); this.drag = undefined }

  private applyDrag(): void {
    if (!this.drag) return
    const { body } = requireEntry(this.bodies, this.drag.bodyId, 'body')
    const point = pointInWorld(body.translation(), body.rotation(), this.drag.localPoint)
    const stiffness = 100
    const damping = 2 * Math.sqrt(stiffness * body.mass())
    const force = sub(scale(sub(this.drag.target, point), stiffness), scale(body.velocityAtPoint(point), damping))
    const magnitude = Math.hypot(force.x, force.y, force.z)
    body.addForceAtPoint(scale(force, magnitude > 0 ? Math.min(1, this.drag.maxForce / magnitude) : 0), point, true)
  }

  reset(): PhysicalSnapshot {
    this.assertAlive()
    this.world.free()
    this.bodies.clear(); this.joints.clear(); this.actuators.clear()
    this.drag = undefined
    this.ticks = 0
    this.world = new RAPIER.World(fromTuple(this.scene.gravity))
    try { this.build() } catch (error) { this.dispose(); throw error }
    return this.snapshot()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.world.free()
    this.bodies.clear(); this.joints.clear(); this.actuators.clear()
    this.drag = undefined
    this.sensorValues = {}
  }
}

function requireEntry<T>(map: Map<string, T>, id: string, kind: string): T {
  const value = map.get(id)
  if (!value) throw new Error(`Unknown physical ${kind}: ${id}`)
  return value
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
  return value
}

function finiteVector(value: Vec3, label: string): Vec3 {
  return { x: finite(value.x, label), y: finite(value.y, label), z: finite(value.z, label) }
}

/** Deterministic tick inputs: a timestamp applies at the first tick starting at or after it.
 * Equal-time commands preserve their input order. Duration must be a whole number of ticks.
 */
export function runPhysicalInputs(runtime: PhysicalRuntime, duration: number, inputs: readonly TimedPhysicalCommand[] = []): PhysicalSnapshot[] {
  finite(duration, 'Duration')
  const ticks = Math.round(duration / runtime.timestep)
  if (duration < 0 || Math.abs(ticks * runtime.timestep - duration) > 1e-9) {
    throw new Error('Duration must be a nonnegative whole number of physical ticks')
  }
  const ordered = inputs.map((input) => {
    finite(input.time, 'Input time')
    finite(input.target, 'Input target')
    if (input.time < 0 || input.time >= duration) throw new Error('Input time must be within the run duration')
    return { ...input }
  }).sort((a, b) => a.time - b.time)
  const snapshots = [runtime.snapshot()]
  let cursor = 0
  for (let tick = 0; tick < ticks; tick++) {
    const commands: PhysicalCommand[] = []
    while (cursor < ordered.length && ordered[cursor].time <= tick * runtime.timestep + 1e-12) {
      commands.push(ordered[cursor++])
    }
    snapshots.push(runtime.step(commands))
  }
  return snapshots
}
