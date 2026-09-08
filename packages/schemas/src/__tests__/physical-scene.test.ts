import { describe, expect, test } from "bun:test";
import { createEmptyPhysicalScene, physicalSceneSchema } from "../physical-scene";

function fixture() {
  const scene = createEmptyPhysicalScene();
  scene.bodies.base = {
    id: "base", name: "Base", kind: "fixed", mass: 1,
    position: [0, 0, 0], rotation: [0, 0, 0],
    colliders: [{ shape: "box", size: [100, 10, 100], offset: [0, 0, 0],
      rotation: [0, 0, 0], friction: 0.5, restitution: 0 }],
  };
  scene.bodies.arm = { ...scene.bodies.base, id: "arm", name: "Arm", kind: "dynamic",
    source: { assemblyBodyId: "missing-source", componentId: "servo", uri: "/assets/arm.glb" } };
  scene.joints.hinge = { id: "hinge", name: "Hinge", kind: "revolute",
    bodyA: "base", bodyB: "arm", anchorA: [0, 5, 0], anchorB: [0, 0, 0],
    axis: [0, 2, 0], limits: { min: -1, max: 1 } };
  scene.actuators.motor = { id: "motor", name: "Motor", jointId: "hinge", kind: "servo",
    target: 0.5, kp: 10, kd: 1, maxForce: 2, speedLimit: 1, source: { pin: "9" } };
  scene.sensors.probe = { id: "probe", name: "Probe", kind: "distance", bodyId: "arm",
    origin: [0, 0, 0], direction: [1, 0, 0], range: 200, inputPin: "A0" };
  scene.testCases.sweep = { id: "sweep", name: "Sweep", duration: 2,
    inputs: [{ time: 0, actuatorId: "motor", target: 1 }],
    assertions: [{ kind: "joint-position", jointId: "hinge", expected: 1, tolerance: 0.01 },
      { kind: "body-position", bodyId: "arm", expected: [0, 0, 0], tolerance: 0.5 },
      { kind: "sensor-value", sensorId: "probe", expected: 100, tolerance: 0.5 }] };
  return scene;
}

describe("physical scene", () => {
  test("standalone configuration round-trips, preserving unresolved sources", () => {
    const scene = fixture();
    expect(physicalSceneSchema.parse(JSON.parse(JSON.stringify(scene)))).toEqual(scene);
    expect(createEmptyPhysicalScene().fixedTimeStep).toBe(1 / 120);
    expect(createEmptyPhysicalScene().gravity).toEqual([0, -9.81, 0]);
  });

  test("rejects unsupported versions and drops runtime-only fields", () => {
    expect(physicalSceneSchema.safeParse({ schemaVersion: 2 }).success).toBe(false);
    expect(physicalSceneSchema.parse({ ...fixture(), handles: {}, time: 12 })).toEqual(fixture());
  });

  test("validates all primitive colliders and rejects nonphysical dimensions", () => {
    const scene = fixture();
    const base = scene.bodies.base;
    if (!base) throw new Error("fixture base missing");
    for (const collider of [
      { shape: "sphere", radius: 5 },
      { shape: "capsule", radius: 5, halfHeight: 0 },
      { shape: "box", size: [1, 2, 3] },
    ]) {
      expect(physicalSceneSchema.safeParse({ ...scene,
        bodies: { ...scene.bodies, base: { ...base, colliders: [collider] } } }).success).toBe(true);
    }
    for (const collider of [
      { shape: "sphere", radius: 0 },
      { shape: "capsule", radius: 5, halfHeight: -1 },
      { shape: "box", size: [1, -2, 3] },
      { shape: "sphere", radius: 5, restitution: 2 },
    ]) {
      expect(physicalSceneSchema.safeParse({ ...scene,
        bodies: { ...scene.bodies, base: { ...base, colliders: [collider] } } }).success).toBe(false);
    }
  });

  test("reports every dangling internal reference at its field path", () => {
    const scene = fixture();
    scene.bodies = {};
    scene.actuators = {};
    scene.sensors = {};
    const result = physicalSceneSchema.safeParse(scene);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected rejection");
    const paths = result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("joints.hinge.bodyA");
    expect(paths).toContain("joints.hinge.bodyB");
    expect(paths).toContain("testCases.sweep.inputs.0.actuatorId");
    expect(paths).toContain("testCases.sweep.assertions.1.bodyId");
    expect(paths).toContain("testCases.sweep.assertions.2.sensorId");
  });

  test("rejects invalid mechanics, IDs, references, numbers and test timing", () => {
    const mutations: Array<(scene: ReturnType<typeof fixture>) => void> = [
      (s) => { const b = s.bodies.base; if (b) b.id = "other"; },
      (s) => { const b = s.bodies.base; if (b) b.mass = 0; },
      (s) => { s.gravity[0] = Infinity; },
      (s) => { const j = s.joints.hinge; if (j) j.bodyB = "base"; },
      (s) => { const j = s.joints.hinge; if (j) j.axis = [0, 0, 0]; },
      (s) => { const j = s.joints.hinge; if (j) j.limits = { min: 2, max: 1 }; },
      (s) => { const j = s.joints.hinge; if (j) { j.kind = "fixed"; delete j.limits; } },
      (s) => { const a = s.actuators.motor; if (a) a.jointId = "missing"; },
      (s) => { const a = s.actuators.motor; if (a) s.actuators.other = { ...a, id: "other" }; },
      (s) => { const sensor = s.sensors.probe; if (sensor) sensor.bodyId = "missing"; },
      (s) => { const t = s.testCases.sweep; if (t) t.inputs = [{ time: 3, actuatorId: "motor", target: 0 }]; },
      (s) => { const t = s.testCases.sweep; if (t) t.inputs = [
        { time: 1, actuatorId: "motor", target: 0 }, { time: 0, actuatorId: "motor", target: 1 }]; },
    ];
    for (const mutate of mutations) {
      const scene = fixture();
      mutate(scene);
      expect(physicalSceneSchema.safeParse(scene).success).toBe(false);
    }
  });
});
