import { z } from "zod";

// Persisted initial configuration only; runtime handles, poses and samples are
// deliberately absent. World is Y-up. Lengths are mm, angles are XYZ radians,
// mass is kg and time is seconds. Gravity alone uses m/s².
const idSchema = z.string().min(1);
const finite = z.number().finite();
const positive = finite.positive();
const nonnegative = finite.nonnegative();
export const physicalVec3Schema = z.tuple([finite, finite, finite]);
const directionSchema = physicalVec3Schema.refine(
  (v) => v.some((n) => n !== 0),
  "Direction must be nonzero (runtime normalizes it)",
);
const identity = { id: idSchema, name: idSchema };

export const physicalBodySourceSchema = z.object({
  assemblyBodyId: idSchema.optional(),
  componentId: idSchema.optional(),
  /** Asset serve path or URI; external references may be unresolved. */
  uri: idSchema.optional(),
  format: z.enum(["glb", "stl"]).optional(),
  node: idSchema.optional(),
  importScale: positive.optional(),
  upAxis: z.enum(["y", "z"]).optional(),
});

const colliderFields = {
  offset: physicalVec3Schema.default([0, 0, 0]),
  rotation: physicalVec3Schema.default([0, 0, 0]),
  friction: nonnegative.default(0.5),
  restitution: nonnegative.max(1).default(0),
};
export const physicalColliderSchema = z.discriminatedUnion("shape", [
  z.object({ ...colliderFields, shape: z.literal("box"),
    /** Full local dimensions, not half extents. */
    size: z.tuple([positive, positive, positive]) }),
  z.object({ ...colliderFields, shape: z.literal("sphere"), radius: positive }),
  z.object({ ...colliderFields, shape: z.literal("capsule"), radius: positive,
    /** Half length of the cylinder along local Y, excluding caps. */
    halfHeight: nonnegative }),
]);
export type PhysicalCollider = z.infer<typeof physicalColliderSchema>;

export const physicalBodySchema = z.object({
  ...identity,
  kind: z.enum(["fixed", "dynamic", "kinematic"]),
  position: physicalVec3Schema,
  rotation: physicalVec3Schema,
  /** Total body mass, distributed across colliders by the runtime. */
  mass: positive,
  colliders: z.array(physicalColliderSchema).min(1),
  source: physicalBodySourceSchema.optional(),
});
export type PhysicalBody = z.infer<typeof physicalBodySchema>;

export const physicalJointSchema = z.object({
  ...identity,
  kind: z.enum(["fixed", "revolute", "prismatic"]),
  bodyA: idSchema,
  bodyB: idSchema,
  anchorA: physicalVec3Schema,
  anchorB: physicalVec3Schema,
  /** Body A local axis. Ignored for fixed joints. */
  axis: directionSchema,
  /** Radians for revolute; mm for prismatic. */
  limits: z.object({ min: finite, max: finite }).refine(
    (v) => v.min <= v.max, "Minimum must not exceed maximum",
  ).optional(),
}).refine((v) => v.kind !== "fixed" || v.limits === undefined,
  { message: "Fixed joints cannot have limits", path: ["limits"] });
export type PhysicalJoint = z.infer<typeof physicalJointSchema>;

export const physicalActuatorSchema = z.object({
  ...identity,
  jointId: idSchema,
  kind: z.enum(["servo", "stepper", "dc"]),
  /** Servo/stepper position in rad or mm; DC velocity in rad/s or mm/s.
   * Step counts and PWM are converted by the command source adapter. */
  target: finite,
  /** SI controller gains; runtime converts translational errors to meters. */
  kp: nonnegative,
  kd: nonnegative,
  /** Torque in N·m for revolute, force in N for prismatic. */
  maxForce: nonnegative,
  /** rad/s for revolute, mm/s for prismatic. */
  speedLimit: positive,
  source: z.object({
    componentId: idSchema.optional(),
    /** Servo signal, step pulse, or DC PWM pin. */
    pin: idSchema.optional(),
    /** Optional STEP/DIR/enable and H-bridge direction pins. */
    directionPin: idSchema.optional(),
    enablePin: idSchema.optional(),
    /** Four coil pins for a stepper driven through a legacy coil API. */
    pins: z.tuple([idSchema, idSchema, idSchema, idSchema]).optional(),
    stepsPerRevolution: positive.optional(),
  }).optional(),
});
export type PhysicalActuator = z.infer<typeof physicalActuatorSchema>;

export const physicalSensorSchema = z.object({
  ...identity,
  kind: z.enum(["contact", "distance"]),
  bodyId: idSchema,
  origin: physicalVec3Schema,
  direction: directionSchema,
  /** Distance ray length or contact probe radius, in mm. */
  range: positive,
  inputPin: idSchema.optional(),
  /** Distance sensors use trigger/echo; contact sensors normally use inputPin. */
  triggerPin: idSchema.optional(),
  echoPin: idSchema.optional(),
  componentId: idSchema.optional(),
});
export type PhysicalSensor = z.infer<typeof physicalSensorSchema>;

export const physicalTestInputSchema = z.object({
  time: nonnegative,
  actuatorId: idSchema,
  target: finite,
});
export const physicalTestAssertionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("joint-position"), jointId: idSchema,
    expected: finite, tolerance: nonnegative }),
  z.object({ kind: z.literal("sensor-value"), sensorId: idSchema,
    /** Contact uses 0/1; distance uses mm. */
    expected: finite, tolerance: nonnegative }),
  z.object({ kind: z.literal("body-position"), bodyId: idSchema,
    expected: physicalVec3Schema, tolerance: nonnegative }),
]);
export const physicalTestCaseSchema = z.object({
  ...identity,
  /** Reset to this scene's initial configuration, then execute inputs. */
  duration: positive,
  inputs: z.array(physicalTestInputSchema).default([]),
  /** Evaluated at duration; position tolerance is Euclidean distance in mm. */
  assertions: z.array(physicalTestAssertionSchema).default([]),
});
export type PhysicalTestInput = z.infer<typeof physicalTestInputSchema>;
export type PhysicalTestAssertion = z.infer<typeof physicalTestAssertionSchema>;
export type PhysicalTestCase = z.infer<typeof physicalTestCaseSchema>;

export const physicalSceneSchema = z.object({
  schemaVersion: z.literal(1),
  gravity: physicalVec3Schema.default([0, -9.81, 0]),
  fixedTimeStep: positive.default(1 / 120),
  bodies: z.record(idSchema, physicalBodySchema).default({}),
  joints: z.record(idSchema, physicalJointSchema).default({}),
  actuators: z.record(idSchema, physicalActuatorSchema).default({}),
  sensors: z.record(idSchema, physicalSensorSchema).default({}),
  testCases: z.record(idSchema, physicalTestCaseSchema).default({}),
}).superRefine((scene, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: "custom", path, message });
  const reference = (record: object, id: string, path: (string | number)[]) => {
    if (!Object.hasOwn(record, id)) issue(path, `Unknown reference: ${id}`);
  };
  for (const field of ["bodies", "joints", "actuators", "sensors", "testCases"] as const) {
    for (const [key, value] of Object.entries(scene[field])) {
      if (key !== value.id) issue([field, key, "id"], "Record key must match id");
    }
  }
  for (const [id, joint] of Object.entries(scene.joints)) {
    for (const field of ["bodyA", "bodyB"] as const)
      reference(scene.bodies, joint[field], ["joints", id, field]);
    if (joint.bodyA === joint.bodyB) issue(["joints", id, "bodyB"], "Joint must connect distinct bodies");
  }
  const driven = new Set<string>();
  for (const [id, actuator] of Object.entries(scene.actuators)) {
    const path = ["actuators", id, "jointId"];
    reference(scene.joints, actuator.jointId, path);
    if (scene.joints[actuator.jointId]?.kind === "fixed") issue(path, "Cannot actuate a fixed joint");
    if (driven.has(actuator.jointId)) issue(path, "Joint already has an actuator");
    driven.add(actuator.jointId);
  }
  for (const [id, sensor] of Object.entries(scene.sensors))
    reference(scene.bodies, sensor.bodyId, ["sensors", id, "bodyId"]);
  for (const [id, test] of Object.entries(scene.testCases)) {
    test.inputs.forEach((input, index) => {
      const path = ["testCases", id, "inputs", index];
      reference(scene.actuators, input.actuatorId, [...path, "actuatorId"]);
      if (input.time > test.duration) issue([...path, "time"], "Input is after test duration");
      const previous = test.inputs[index - 1];
      if (previous && input.time < previous.time) issue([...path, "time"], "Inputs must be in time order");
    });
    test.assertions.forEach((assertion, index) => {
      const path = ["testCases", id, "assertions", index];
      switch (assertion.kind) {
        case "body-position": reference(scene.bodies, assertion.bodyId, [...path, "bodyId"]); break;
        case "joint-position": reference(scene.joints, assertion.jointId, [...path, "jointId"]); break;
        case "sensor-value": reference(scene.sensors, assertion.sensorId, [...path, "sensorId"]); break;
      }
    });
  }
});
export type PhysicalScene = z.infer<typeof physicalSceneSchema>;

export function createEmptyPhysicalScene(): PhysicalScene {
  return physicalSceneSchema.parse({ schemaVersion: 1 });
}
