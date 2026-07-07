// ── Assembly panel ──────────────────────────────────────────────────────────
//
// DOM overlay listing uploaded bodies with the selected body's mounting
// controls: parent (world / another body / a component's node), rotation
// joint (pivot + axis), and delete. Reparenting preserves the body's world
// pose by rebasing its transform into the new parent's frame.

import { useSyncExternalStore } from "react"
import { Euler, Matrix4, Quaternion, Vector3 } from "three"
import type { AssemblyBody, BodyParent, Vec3 } from "@dreamer/schemas"
import { isBoardComponentType } from "@dreamer/schemas"
import { useBoardSelector } from "@/store/board-context"
import { cn } from "@/utils/classnames"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAssemblyActions, useAssemblyDoc } from "./use-assembly"
import { useEditor } from "./editor-state"
import { getBodyRoot, getRegistryVersion, subscribeRegistry } from "./scene-registry"
import { componentTarget } from "./uploaded-bodies"

// ── Parent option encoding for the <select> ─────────────────────────────────

function encodeParent(parent: BodyParent): string {
  if (parent.kind === "world") return "world"
  if (parent.kind === "body") return `body:${parent.bodyId}`
  return `comp:${parent.componentId}:${parent.node}`
}

function decodeParent(value: string): BodyParent {
  if (value.startsWith("body:")) return { kind: "body", bodyId: value.slice(5) }
  if (value.startsWith("comp:")) {
    const [, componentId, node] = value.split(":")
    return {
      kind: "component",
      componentId,
      node: node === "angle" || node === "spin" ? node : "body",
    }
  }
  return { kind: "world" }
}

/** True if making `next` the parent of `bodyId` would create a cycle. */
function wouldCycle(
  bodies: Record<string, AssemblyBody>,
  bodyId: string,
  next: BodyParent,
): boolean {
  if (next.kind !== "body") return false
  let current: string | undefined = next.bodyId
  while (current) {
    if (current === bodyId) return true
    const parent: BodyParent | undefined = bodies[current]?.parent
    current = parent?.kind === "body" ? parent.bodyId : undefined
  }
  return false
}

/**
 * Rebase the body's transform into the new parent's frame so it doesn't jump
 * on reparent. Falls back to keeping the stored transform when the scene
 * nodes aren't mounted (e.g. the tab was never opened this session).
 */
function reparentChanges(bodyId: string, next: BodyParent): Partial<AssemblyBody> {
  const obj = getBodyRoot(bodyId)
  const targetObj =
    next.kind === "world"
      ? null
      : next.kind === "body"
        ? getBodyRoot(next.bodyId)
        : componentTarget(next.componentId, next.node)
  if (!obj || (next.kind !== "world" && !targetObj)) return { parent: next }

  obj.updateWorldMatrix(true, false)
  const parentWorld = new Matrix4()
  if (targetObj) {
    targetObj.updateWorldMatrix(true, false)
    parentWorld.copy(targetObj.matrixWorld)
  }
  const local = parentWorld.invert().multiply(obj.matrixWorld)
  const position = new Vector3()
  const quaternion = new Quaternion()
  const scale = new Vector3()
  local.decompose(position, quaternion, scale)
  const euler = new Euler().setFromQuaternion(quaternion)
  return {
    parent: next,
    transform: {
      position: [position.x, position.y, position.z],
      rotation: [euler.x, euler.y, euler.z],
      scale: scale.x,
    },
  }
}

// ── Joint controls ──────────────────────────────────────────────────────────

const AXIS_OPTIONS: { label: string; axis: Vec3 }[] = [
  { label: "X", axis: [1, 0, 0] },
  { label: "Y", axis: [0, 1, 0] },
  { label: "Z", axis: [0, 0, 1] },
]

function axisLabel(axis: Vec3): string {
  const match = AXIS_OPTIONS.find(
    (option) =>
      option.axis[0] === axis[0] && option.axis[1] === axis[1] && option.axis[2] === axis[2],
  )
  return match?.label ?? "Y"
}

function JointEditor({ body }: { body: AssemblyBody }) {
  const { updateBody } = useAssemblyActions()
  if (!body.joint) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => updateBody(body.id, { joint: { pivot: [0, 0, 0], axis: [0, 1, 0] } })}
      >
        + Add rotation joint
      </Button>
    )
  }
  const joint = body.joint
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Rotation joint</span>
        <Button size="sm" variant="ghost" onClick={() => updateBody(body.id, { joint: undefined })}>
          Remove
        </Button>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Axis</span>
        <select
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          value={axisLabel(joint.axis)}
          onChange={(e) => {
            const option = AXIS_OPTIONS.find((o) => o.label === e.target.value)
            if (option) updateBody(body.id, { joint: { ...joint, axis: option.axis } })
          }}
        >
          {AXIS_OPTIONS.map((option) => (
            <option key={option.label} value={option.label}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Pivot (mm, body-local)</span>
        <div className="flex gap-1">
          {([0, 1, 2] as const).map((index) => (
            <Input
              key={`${body.id}-${index}-${joint.pivot[index]}`}
              type="number"
              className="h-7 text-xs"
              defaultValue={joint.pivot[index]}
              onBlur={(e) => {
                const value = Number(e.target.value)
                if (Number.isNaN(value)) return
                const pivot: Vec3 = [...joint.pivot]
                pivot[index] = value
                updateBody(body.id, { joint: { ...joint, pivot } })
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Panel ───────────────────────────────────────────────────────────────────

export function AssemblyPanel() {
  const assembly = useAssemblyDoc()
  const { updateBody, removeBody } = useAssemblyActions()
  const { selectedBodyId, select } = useEditor()
  const components = useBoardSelector((ctx) => ctx.components)
  // Parent targets resolve against live scene nodes; refresh when they change.
  useSyncExternalStore(subscribeRegistry, getRegistryVersion, getRegistryVersion)

  const bodies = Object.values(assembly.bodies)
  if (bodies.length === 0) return null

  const selected = selectedBodyId ? assembly.bodies[selectedBodyId] : undefined

  const mountableComponents = Object.values(components).filter(
    (component) => !isBoardComponentType(component.type),
  )

  return (
    <div className="pointer-events-auto absolute left-2 top-2 w-60 rounded-lg border border-border bg-background/95 p-2 text-sm shadow-lg backdrop-blur">
      <div className="mb-1 text-xs font-semibold text-muted-foreground">Assembly</div>
      <ul className="max-h-40 space-y-0.5 overflow-y-auto">
        {bodies.map((body) => (
          <li key={body.id}>
            <button
              type="button"
              className={cn(
                "w-full rounded px-2 py-1 text-left text-xs hover:bg-muted",
                body.id === selectedBodyId && "bg-muted font-medium",
              )}
              onClick={() => select(body.id === selectedBodyId ? null : body.id)}
            >
              {body.name}
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <div className="mt-2 space-y-3 border-t border-border pt-2">
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Name</span>
            <Input
              key={`${selected.id}-name`}
              className="h-7 text-xs"
              defaultValue={selected.name}
              onBlur={(e) => {
                const name = e.target.value.trim()
                if (name && name !== selected.name) updateBody(selected.id, { name })
              }}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Mounted on</span>
            <select
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
              value={encodeParent(selected.parent)}
              onChange={(e) => {
                const next = decodeParent(e.target.value)
                if (wouldCycle(assembly.bodies, selected.id, next)) return
                updateBody(selected.id, reparentChanges(selected.id, next))
              }}
            >
              <option value="world">World</option>
              {bodies
                .filter(
                  (body) =>
                    body.id !== selected.id &&
                    !wouldCycle(assembly.bodies, selected.id, { kind: "body", bodyId: body.id }),
                )
                .map((body) => (
                  <option key={body.id} value={`body:${body.id}`}>
                    {body.name}
                  </option>
                ))}
              {mountableComponents.flatMap((component) => {
                const label = component.name ?? component.type
                const options = [
                  <option key={`${component.id}-body`} value={`comp:${component.id}:body`}>
                    {label}
                  </option>,
                ]
                if (component.type === "servo") {
                  options.push(
                    <option key={`${component.id}-angle`} value={`comp:${component.id}:angle`}>
                      {label} — horn (moves)
                    </option>,
                  )
                }
                if (component.type === "dc_motor") {
                  options.push(
                    <option key={`${component.id}-spin`} value={`comp:${component.id}:spin`}>
                      {label} — shaft (spins)
                    </option>,
                  )
                }
                return options
              })}
            </select>
          </label>

          <JointEditor body={selected} />

          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="text-red-500"
              onClick={() => {
                removeBody(selected.id)
                select(null)
              }}
            >
              Delete body
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
