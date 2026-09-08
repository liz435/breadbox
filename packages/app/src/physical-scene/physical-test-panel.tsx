import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useLoader, useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { Color, Plane, Vector2, Vector3 } from "three"
import { GLTFLoader, STLLoader, SkeletonUtils } from "three-stdlib"
import { API_ORIGIN } from "@dreamer/config"
import type { PhysicalBody, PhysicalScene } from "@dreamer/schemas"
import { createEmptyPhysicalScene } from "@dreamer/schemas"
import { usePhysicalDocument, physicalDocumentStore } from "./document-store"
import { PhysicalRuntime, type PhysicalSnapshot } from "./runtime"
import { arduinoBindingsForScene, PhysicalSimulationCoordinator } from "./coordinator"
import { compileArduinoProgramDriver } from "./arduino-adapter"
import { runPhysicalTestCase, type PhysicalTestResult } from "./testing"
import { compileSketch } from "@/simulator/avr-compiler"
import { BOARD_TARGETS, DEFAULT_BOARD_TARGET } from "@dreamer/schemas"
import { useBoard } from "@/store/board-context"
import { toast } from "@/components/ui/toast"
import { useAssemblyDoc } from "@/breadboard-3d/use-assembly"

const MM = 0.001

type RuntimeState = {
  runtime: PhysicalRuntime | null
  snapshot: PhysicalSnapshot | null
  error: string | null
  running: boolean
  source: "manual" | "sketch"
}

function bodyColor(body: PhysicalBody): string {
  if (body.kind === "fixed") return "#546e7a"
  if (body.kind === "kinematic") return "#f9a825"
  return "#42a5f5"
}

function ColliderMesh({ body }: { body: PhysicalBody }) {
  return (
    <group>
      {body.colliders.map((collider, index) => {
        const key = `${body.id}:${index}`
        if (collider.shape === "box") {
          return (
            <mesh key={key} position={collider.offset.map((value) => value * MM) as [number, number, number]} rotation={collider.rotation as [number, number, number]} castShadow receiveShadow>
              <boxGeometry args={collider.size.map((value) => value * MM) as [number, number, number]} />
              <meshStandardMaterial color={bodyColor(body)} roughness={0.62} metalness={0.1} />
            </mesh>
          )
        }
        if (collider.shape === "sphere") {
          return (
            <mesh key={key} position={collider.offset.map((value) => value * MM) as [number, number, number]} castShadow receiveShadow>
              <sphereGeometry args={[collider.radius * MM, 24, 16]} />
              <meshStandardMaterial color={bodyColor(body)} roughness={0.62} metalness={0.1} />
            </mesh>
          )
        }
        return (
          <mesh key={key} position={collider.offset.map((value) => value * MM) as [number, number, number]} rotation={collider.rotation as [number, number, number]} castShadow receiveShadow>
            <capsuleGeometry args={[collider.radius * MM, collider.halfHeight * 2 * MM, 16, 8]} />
            <meshStandardMaterial color={bodyColor(body)} roughness={0.62} metalness={0.1} />
          </mesh>
        )
      })}
    </group>
  )
}

function PhysicalGlb({ uri, node, importScale = 1, upAxis = "y" }: { uri: string; node?: string; importScale?: number; upAxis?: "y" | "z" }) {
  const gltf = useLoader(GLTFLoader, uri)
  const object = useMemo(() => {
    const source = node ? gltf.scene.getObjectByName(node) : gltf.scene
    return source ? SkeletonUtils.clone(source) : null
  }, [gltf, node])
  if (!object) return null
  return <primitive object={object} scale={importScale} rotation={upAxis === "z" ? [-Math.PI / 2, 0, 0] : [0, 0, 0]} />
}

function PhysicalStl({ uri, importScale = 1 }: { uri: string; importScale?: number }) {
  const geometry = useLoader(STLLoader, uri)
  return <mesh geometry={geometry} scale={importScale} castShadow receiveShadow>
    <meshStandardMaterial color="#90a4ae" roughness={0.6} metalness={0.15} />
  </mesh>
}

function PhysicalVisual({ body }: { body: PhysicalBody }) {
  const source = body.source
  if (!source?.uri) return null
  const uri = source.uri.startsWith("http") ? source.uri : `${API_ORIGIN}${source.uri}`
  const format = source.format ?? (source.uri.toLowerCase().endsWith(".stl") ? "stl" : "glb")
  return format === "stl"
    ? <PhysicalStl uri={uri} importScale={source.importScale} />
    : <PhysicalGlb uri={uri} node={source.node} importScale={source.importScale} upAxis={source.upAxis} />
}

function PhysicalBody({
  body,
  snapshot,
  debug,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  body: PhysicalBody
  snapshot: PhysicalSnapshot | null
  debug: boolean
  onDragStart: (bodyId: string, point: Vector3) => void
  onDragMove: (bodyId: string, point: Vector3) => void
  onDragEnd: () => void
}) {
  const { camera, raycaster } = useThree()
  const plane = useRef(new Plane(new Vector3(0, 1, 0), 0))
  const dragging = useRef(false)
  const pose = snapshot?.bodies[body.id]
  const position = pose ? [pose.position.x * MM, pose.position.y * MM, pose.position.z * MM] as [number, number, number] : body.position.map((value) => value * MM) as [number, number, number]
  const eventPoint = useCallback((event: { pointer: { x: number; y: number } }) => {
    raycaster.setFromCamera(new Vector2(event.pointer.x, event.pointer.y), camera)
    const hit = new Vector3()
    return raycaster.ray.intersectPlane(plane.current, hit) ? hit : null
  }, [camera, raycaster])
  return (
    <group
      position={position}
      quaternion={pose ? [pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w] : undefined}
      rotation={pose ? undefined : body.rotation}
      onPointerDown={(event) => {
        if (body.kind !== "dynamic") return
        event.stopPropagation()
        plane.current.set(new Vector3(0, 1, 0), -event.point.y)
        dragging.current = true
        onDragStart(body.id, event.point)
        const target = event.target as unknown as { setPointerCapture: (pointerId: number) => void }
        target.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return
        const point = eventPoint(event)
        if (point) onDragMove(body.id, point)
      }}
      onPointerUp={(event) => {
        if (!dragging.current) return
        dragging.current = false
        const target = event.target as unknown as { releasePointerCapture: (pointerId: number) => void }
        target.releasePointerCapture(event.pointerId)
        onDragEnd()
      }}
    >
      <ColliderMesh body={body} />
      <Suspense fallback={null}><PhysicalVisual body={body} /></Suspense>
      {debug && <mesh>
        <boxGeometry args={[0.02, 0.02, 0.02]} />
        <meshBasicMaterial color={new Color("#ff1744")} wireframe />
      </mesh>}
    </group>
  )
}

function PhysicalBodies({ scene, snapshot, debug, onDragStart, onDragMove, onDragEnd }: {
  scene: PhysicalScene
  snapshot: PhysicalSnapshot | null
  debug: boolean
  onDragStart: (bodyId: string, point: Vector3) => void
  onDragMove: (bodyId: string, point: Vector3) => void
  onDragEnd: () => void
}) {
  return (
    <>
      {Object.values(scene.bodies).map((body) => <PhysicalBody key={body.id} body={body} snapshot={snapshot} debug={debug} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} />)}
    </>
  )
}

function PhysicalWorld({ scene, snapshot, debug, onDragStart, onDragMove, onDragEnd }: {
  scene: PhysicalScene
  snapshot: PhysicalSnapshot | null
  debug: boolean
  onDragStart: (bodyId: string, point: Vector3) => void
  onDragMove: (bodyId: string, point: Vector3) => void
  onDragEnd: () => void
}) {
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => { invalidate() }, [snapshot, invalidate])
  return (
    <>
      <color attach="background" args={["#18212b"]} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[2, 4, 3]} intensity={2} castShadow />
      <gridHelper args={[2.4, 24, "#607d8b", "#263238"]} />
      <mesh position={[0, -0.015, 0]} receiveShadow>
        <boxGeometry args={[2.4, 0.03, 1.6]} />
        <meshStandardMaterial color="#263238" roughness={0.9} />
      </mesh>
      <PhysicalBodies scene={scene} snapshot={snapshot} debug={debug} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} />
      <OrbitControls makeDefault />
    </>
  )
}

function defaultTestScene(): PhysicalScene {
  const scene = createEmptyPhysicalScene()
  return {
    ...scene,
    bodies: {
      base: {
        id: "base", name: "Fixed base", kind: "fixed", position: [0, 0, 0], rotation: [0, 0, 0], mass: 1,
        colliders: [{ shape: "box", size: [520, 30, 320], offset: [0, -15, 0], rotation: [0, 0, 0], friction: 0.7, restitution: 0 }],
      },
      block: {
        id: "block", name: "Test block", kind: "dynamic", position: [55, 38, 0], rotation: [0, 0, 0], mass: 0.2,
        colliders: [{ shape: "box", size: [60, 60, 60], offset: [0, 0, 0], rotation: [0, 0, 0], friction: 0.5, restitution: 0.05 }],
      },
      arm: {
        id: "arm", name: "Servo arm", kind: "dynamic", position: [-20, 25, 0], rotation: [0, 0, 0], mass: 0.12,
        colliders: [{ shape: "box", size: [120, 18, 18], offset: [0, 0, 0], rotation: [0, 0, 0], friction: 0.55, restitution: 0 }],
      },
    },
    joints: {
      armHinge: {
        id: "armHinge", name: "Servo hinge", kind: "revolute", bodyA: "base", bodyB: "arm",
        anchorA: [-80, 25, 0], anchorB: [-60, 0, 0], axis: [0, 1, 0], limits: { min: -1.2, max: 1.2 },
      },
    },
    actuators: {
      servo: {
        id: "servo", name: "Servo drive", jointId: "armHinge", kind: "servo", target: 0.8,
        kp: 8, kd: 1.2, maxForce: 0.8, speedLimit: 2.5,
        source: { pin: "9" },
      },
    },
    sensors: {},
    testCases: {},
  }
}

export function PhysicalTestPanel() {
  const document = usePhysicalDocument()
  const assembly = useAssemblyDoc()
  const { state: boardState } = useBoard()
  const [debug, setDebug] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [runtimeState, setRuntimeState] = useState<RuntimeState>({ runtime: null, snapshot: null, error: null, running: false, source: "manual" })
  const [compileBusy, setCompileBusy] = useState(false)
  const [testResult, setTestResult] = useState<PhysicalTestResult | null>(null)
  const runtimeRef = useRef<PhysicalRuntime | null>(null)
  const coordinatorRef = useRef<PhysicalSimulationCoordinator | null>(null)
  const runtimeGeneration = useRef(0)
  const scene = document.scene

  const startRuntime = useCallback(async (nextScene: PhysicalScene) => {
    const generation = ++runtimeGeneration.current
    coordinatorRef.current?.dispose()
    coordinatorRef.current = null
    runtimeRef.current?.dispose()
    setRuntimeState({ runtime: null, snapshot: null, error: null, running: false, source: "manual" })
    try {
      const runtime = await PhysicalRuntime.create(nextScene)
      if (generation !== runtimeGeneration.current) {
        runtime.dispose()
        return
      }
      runtimeRef.current = runtime
      setRuntimeState({ runtime, snapshot: runtime.snapshot(), error: null, running: false, source: "manual" })
    } catch (error) {
      setRuntimeState({ runtime: null, snapshot: null, error: error instanceof Error ? error.message : String(error), running: false, source: "manual" })
    }
  }, [])

  useEffect(() => {
    if (scene) void startRuntime(scene)
    else setRuntimeState({ runtime: null, snapshot: null, error: null, running: false, source: "manual" })
    return () => {
      runtimeGeneration.current += 1
      coordinatorRef.current?.dispose()
      coordinatorRef.current = null
      runtimeRef.current?.dispose()
      runtimeRef.current = null
    }
  }, [scene, startRuntime])

  const tick = useCallback(() => {
    const runtime = runtimeRef.current
    if (!runtime) return
    try {
      let snapshot = runtime.snapshot()
      const coordinator = coordinatorRef.current
      const steps = Math.max(1, Math.round(1 / (60 * runtime.timestep)))
      if (coordinator) {
        for (let index = 0; index < steps; index += 1) snapshot = coordinator.step()
      } else {
        for (let index = 0; index < steps; index += 1) snapshot = runtime.step()
      }
      setRuntimeState((current) => ({ ...current, snapshot, running: true }))
    } catch (error) {
      setRuntimeState((current) => ({ ...current, error: error instanceof Error ? error.message : String(error), running: false }))
    }
  }, [speed])

  useEffect(() => {
    if (!runtimeState.running) return
    const id = window.setInterval(tick, 1000 / (60 * speed))
    return () => window.clearInterval(id)
  }, [runtimeState.running, tick, speed])

  const runSketch = useCallback(async () => {
    if (!scene || !runtimeRef.current || compileBusy) return
    setCompileBusy(true)
    setRuntimeState((current) => ({ ...current, error: null, running: false }))
    coordinatorRef.current?.dispose({ disposeRuntime: false })
    coordinatorRef.current = null
    try {
      const target = BOARD_TARGETS[boardState.boardTarget ?? DEFAULT_BOARD_TARGET]
      if (target.id !== "arduino_uno" && target.id !== "arduino_nano") {
        throw new Error("Physical sketch mode currently requires an Arduino Uno or Nano (ATmega328P)")
      }
      const bindings = arduinoBindingsForScene(scene)
      const driver = await compileArduinoProgramDriver(
        boardState.sketchCode,
        async (source) => {
          const compiled = await compileSketch(source, {
            fqbn: target.fqbn,
            customLibraries: boardState.customLibraries,
          })
          if (!compiled.success) return compiled
          return compiled.format === "hex"
            ? { success: true, format: "hex" as const, hex: compiled.hex }
            : { success: true, format: "uf2" as const }
        },
        bindings,
      )
      const coordinator = new PhysicalSimulationCoordinator(runtimeRef.current, driver, scene, Object.values(scene.sensors))
      coordinator.start()
      coordinatorRef.current = coordinator
      setRuntimeState((current) => ({ ...current, source: "sketch", running: true, snapshot: runtimeRef.current?.snapshot() ?? current.snapshot }))
    } catch (error) {
      setRuntimeState((current) => ({ ...current, error: error instanceof Error ? error.message : String(error), running: false }))
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setCompileBusy(false)
    }
  }, [boardState.boardTarget, boardState.customLibraries, boardState.sketchCode, compileBusy, scene])

  const stopSketch = useCallback(() => {
    coordinatorRef.current?.dispose({ disposeRuntime: false })
    coordinatorRef.current = null
    setRuntimeState((current) => ({ ...current, source: "manual", running: false }))
  }, [])

  const runTests = useCallback(async () => {
    if (!scene) return
    try {
      coordinatorRef.current?.pause()
      setRuntimeState((current) => ({ ...current, running: false }))
      const cases = Object.values(scene.testCases)
      if (cases.length === 0) throw new Error("This scene has no saved test cases")
      // A scene currently has one result slot; the first failing case is shown
      // immediately, while a passing result proves every assertion in order.
      let last: PhysicalTestResult | null = null
      for (const testCase of cases) {
        last = await runPhysicalTestCase(scene, testCase)
        if (!last.passed) break
      }
      setTestResult(last)
      if (last?.passed) toast.success(`Physical test passed: ${last.testCaseId}`)
      else toast.error(`Physical test failed: ${last?.testCaseId ?? "unknown"}`)
    } catch (error) {
      setTestResult(null)
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }, [scene])

  const toggleRunning = useCallback(() => {
    const coordinator = coordinatorRef.current
    try {
      if (coordinator) {
        if (runtimeState.running) coordinator.pause()
        else coordinator.start()
      }
      setRuntimeState((current) => ({ ...current, running: !current.running }))
    } catch (error) {
      setRuntimeState((current) => ({ ...current, error: error instanceof Error ? error.message : String(error), running: false }))
    }
  }, [runtimeState.running])

  const reset = useCallback(() => {
    const runtime = runtimeRef.current
    if (!runtime) return
    try {
      const snapshot = coordinatorRef.current ? coordinatorRef.current.reset() : runtime.reset()
      setRuntimeState((current) => ({ ...current, snapshot, running: false }))
    } catch (error) {
      setRuntimeState((current) => ({ ...current, error: error instanceof Error ? error.message : String(error), running: false }))
    }
  }, [])

  const createScene = useCallback(() => {
    physicalDocumentStore.edit(defaultTestScene())
  }, [])
  const importAssembly = useCallback(() => {
    const bodies: PhysicalScene["bodies"] = {
      floor: {
        id: "floor", name: "Test floor", kind: "fixed", position: [0, 0, 0], rotation: [0, 0, 0], mass: 1,
        colliders: [{ shape: "box", size: [1200, 30, 900], offset: [0, -15, 0], rotation: [0, 0, 0], friction: 0.7, restitution: 0 }],
      },
    }
    for (const body of Object.values(assembly.bodies)) {
      bodies[`assembly:${body.id}`] = {
        id: `assembly:${body.id}`,
        name: body.name,
        kind: body.parent.kind === "component" ? "kinematic" : "dynamic",
        position: body.transform.position,
        rotation: body.transform.rotation,
        mass: 0.2,
        source: {
          assemblyBodyId: body.id,
          uri: body.uri,
          format: body.format,
          node: body.node,
          importScale: body.importScale,
          upAxis: body.upAxis,
        },
        colliders: [{ shape: "box", size: [80, 80, 80], offset: [0, 0, 0], rotation: [0, 0, 0], friction: 0.5, restitution: 0.05 }],
      }
    }
    physicalDocumentStore.edit({ ...createEmptyPhysicalScene(), bodies })
  }, [assembly.bodies])
  const clearScene = useCallback(() => {
    physicalDocumentStore.edit(null)
  }, [])
  const step = useCallback(() => {
    const runtime = runtimeRef.current
    if (!runtime) return
    try {
      const snapshot = coordinatorRef.current ? coordinatorRef.current.singleStep() : runtime.step()
      setRuntimeState((current) => ({ ...current, snapshot, running: false }))
    } catch (error) {
      setRuntimeState((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) }))
    }
  }, [])

  const addBox = useCallback(() => {
    physicalDocumentStore.edit((current) => {
      if (!current) return current
      const index = Object.keys(current.bodies).length + 1
      const id = `box-${index}`
      return {
        ...current,
        bodies: {
          ...current.bodies,
          [id]: {
            id,
            name: `Dynamic box ${index}`,
            kind: "dynamic",
            position: [0, 180, 0],
            rotation: [0, 0, 0],
            mass: 0.15,
            colliders: [{
              shape: "box",
              size: [40, 40, 40],
              offset: [0, 0, 0],
              rotation: [0, 0, 0],
              friction: 0.5,
              restitution: 0.05,
            }],
          },
        },
      }
    })
  }, [])

  const removeBody = useCallback((bodyId: string) => {
    physicalDocumentStore.edit((current) => {
      if (!current) return current
      const bodies = { ...current.bodies }
      delete bodies[bodyId]
      const joints = Object.fromEntries(Object.entries(current.joints).filter(([, joint]) => joint.bodyA !== bodyId && joint.bodyB !== bodyId))
      const jointIds = new Set(Object.keys(joints))
      const actuators = Object.fromEntries(Object.entries(current.actuators).filter(([, actuator]) => jointIds.has(actuator.jointId)))
      const sensors = Object.fromEntries(Object.entries(current.sensors).filter(([, sensor]) => sensor.bodyId !== bodyId))
      return { ...current, bodies, joints, actuators, sensors }
    })
  }, [])

  const changeActuatorTarget = useCallback((actuatorId: string, value: number) => {
    if (coordinatorRef.current) return
    runtimeRef.current?.command(actuatorId, value)
  }, [])

  const persistActuatorTarget = useCallback((actuatorId: string, value: number) => {
    physicalDocumentStore.edit((current) => {
      if (!current || !current.actuators[actuatorId]) return current
      return {
        ...current,
        actuators: {
          ...current.actuators,
          [actuatorId]: { ...current.actuators[actuatorId], target: value },
        },
      }
    })
  }, [])

  const dragStart = useCallback((bodyId: string, point: Vector3) => {
    runtimeRef.current?.setDrag(bodyId, { x: 0, y: 0, z: 0 }, { x: point.x / MM, y: point.y / MM, z: point.z / MM })
  }, [])
  const dragMove = useCallback((bodyId: string, point: Vector3) => {
    runtimeRef.current?.setDrag(bodyId, { x: 0, y: 0, z: 0 }, { x: point.x / MM, y: point.y / MM, z: point.z / MM })
  }, [])
  const dragEnd = useCallback(() => runtimeRef.current?.clearDrag(), [])

  const selectedCount = useMemo(() => scene ? Object.keys(scene.bodies).length : 0, [scene])

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 text-xs">
        <span className="font-semibold tracking-wide">PHYSICAL TEST</span>
        <span className="text-slate-400">{selectedCount} bodies</span>
        <button className="rounded bg-emerald-700 px-2 py-1 hover:bg-emerald-600" onClick={toggleRunning} disabled={!runtimeState.runtime || compileBusy}>{runtimeState.running ? "Pause" : "Run"}</button>
        {runtimeState.source === "manual" ? (
          <button className="rounded bg-violet-700 px-2 py-1 hover:bg-violet-600" onClick={() => void runSketch()} disabled={!runtimeState.runtime || compileBusy}>{compileBusy ? "Compiling…" : "Run sketch"}</button>
        ) : (
          <button className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600" onClick={stopSketch} disabled={compileBusy}>Manual mode</button>
        )}
        <button className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600" onClick={step} disabled={!runtimeState.runtime}>Step</button>
        <button className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600" onClick={reset} disabled={!runtimeState.runtime}>Reset</button>
        <label className="ml-auto flex items-center gap-1 text-slate-400">Speed
          <select className="rounded bg-slate-800 px-1 py-1 text-slate-100" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            <option value={0.25}>0.25×</option><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option>
          </select>
        </label>
        <button className="rounded bg-slate-700 px-2 py-1" onClick={() => setDebug((value) => !value)}>{debug ? "Hide debug" : "Show debug"}</button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {scene ? <Canvas camera={{ position: [0.6, 0.5, 0.8], fov: 42, near: 0.001, far: 10 }} shadows>
            <PhysicalWorld scene={scene} snapshot={runtimeState.snapshot} debug={debug} onDragStart={dragStart} onDragMove={dragMove} onDragEnd={dragEnd} />
          </Canvas> : <div className="flex h-full items-center justify-center text-sm text-slate-400">Create a physical test scene to begin.</div>}
          {runtimeState.error && <div className="absolute bottom-3 left-3 right-3 rounded bg-red-950/90 px-3 py-2 text-xs text-red-200">{runtimeState.error}</div>}
        </div>
        <aside className="w-64 shrink-0 border-l border-slate-800 p-3 text-xs">
          <div className="mb-3 flex gap-2">
            <button className="rounded bg-blue-700 px-2 py-1 hover:bg-blue-600" onClick={createScene}>New test scene</button>
            <button className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600" onClick={importAssembly} disabled={Object.keys(assembly.bodies).length === 0}>Import assembly</button>
            <button className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600" onClick={addBox} disabled={!scene}>+ Box</button>
            <button className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600" onClick={clearScene} disabled={!scene}>Clear</button>
            <button className="rounded bg-amber-700 px-2 py-1 hover:bg-amber-600" onClick={() => void runTests()} disabled={!scene || Object.keys(scene?.testCases ?? {}).length === 0}>Run tests</button>
          </div>
          <div className="space-y-2 text-slate-400">
            <div>Time <span className="float-right text-slate-100">{runtimeState.snapshot?.time.toFixed(3) ?? "0.000"} s</span></div>
            <div>Runtime <span className="float-right text-slate-100">{runtimeState.runtime ? runtimeState.source : "offline"}</span></div>
            {testResult && <div>Last test <span className={testResult.passed ? "float-right text-emerald-400" : "float-right text-red-400"}>{testResult.passed ? "passed" : "failed"}</span></div>}
          </div>
          {scene && <div className="mt-5 space-y-2">
            <div className="font-semibold text-slate-200">Bodies</div>
            {Object.values(scene.bodies).map((body) => <div key={body.id} className="flex items-center justify-between rounded bg-slate-900 px-2 py-1"><span>{body.name}</span><span className="text-slate-500">{body.kind}</span></div>)}
          </div>}
          {scene && Object.values(scene.actuators).length > 0 && <div className="mt-5 space-y-3">
            <div className="font-semibold text-slate-200">Actuators</div>
            {Object.values(scene.actuators).map((actuator) => {
              const joint = scene.joints[actuator.jointId]
              const min = joint?.limits?.min ?? -Math.PI
              const max = joint?.limits?.max ?? Math.PI
              const actual = runtimeState.snapshot?.actuators[actuator.id]?.actual ?? actuator.target
              return <div key={actuator.id} className="rounded bg-slate-900 p-2">
                <div className="mb-1 flex justify-between"><span>{actuator.name}</span><span className="text-slate-400">{actual.toFixed(2)} rad</span></div>
                <input className="w-full" type="range" min={min} max={max} step={0.01} defaultValue={actuator.target} disabled={runtimeState.source === "sketch"}
                  onChange={(event) => changeActuatorTarget(actuator.id, Number(event.target.value))}
                  onMouseUp={(event) => persistActuatorTarget(actuator.id, Number(event.currentTarget.value))}
                  onTouchEnd={(event) => persistActuatorTarget(actuator.id, Number(event.currentTarget.value))} />
              </div>
            })}
          </div>}
          {scene && runtimeState.snapshot && Object.values(scene.sensors).length > 0 && <div className="mt-5 space-y-2">
            <div className="font-semibold text-slate-200">Sensors</div>
            {Object.values(scene.sensors).map((sensor) => {
              const value = runtimeState.snapshot?.sensors[sensor.id]
              return <div key={sensor.id} className="flex justify-between rounded bg-slate-900 px-2 py-1"><span>{sensor.name}</span><span className={value?.active ? "text-emerald-400" : "text-slate-500"}>{value?.distanceMm == null ? (value?.active ? "active" : "idle") : `${value.distanceMm.toFixed(1)} mm`}</span></div>
            })}
          </div>}
        </aside>
      </div>
    </div>
  )
}
