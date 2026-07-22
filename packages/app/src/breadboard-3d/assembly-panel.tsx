// ── Scene manager panel ─────────────────────────────────────────────────────
//
// Always-present DOM overlay for managing the 3D scene: add / list / show-hide
// / lock / reorder / rename / duplicate / delete the uploaded bodies, plus an
// asset library for reusing and reclaiming model files. The selected body gets
// its mounting inspector: parent (world / another body / a component's node),
// joint (rotate hinge or slide rail), signal bindings (joint motion + emissive
// glow), and GLB clip playback. Reparenting preserves the body's world pose by
// rebasing its transform into the new parent's frame.

import { useState, useSyncExternalStore } from "react"
import {
  Box,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Lock,
  Plus,
  Unlock,
} from "lucide-react"
import { Euler, Matrix4, Quaternion, Vector3 } from "three"
import type { AssemblyBody, AssemblyBinding, BodyParent, Vec3 } from "@dreamer/schemas"
import { isBoardComponentType, isCustomComponentType } from "@dreamer/schemas"
import { useBoardSelector } from "@/store/board-context"
import { getCustomDef } from "@/components/catalog/custom-store"
import { cn } from "@/utils/classnames"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAssemblyActions, useAssemblyDoc } from "./use-assembly"
import { useEditor, type GizmoMode } from "./editor-state"
import { getBodyRoot, getPartNodes, getRegistryVersion, subscribeRegistry } from "./scene-registry"
import { componentTarget } from "./uploaded-bodies"
import { movingMountOptions } from "./mount-targets"
import { AssetLibrary } from "./asset-library"

/** Transform-gizmo modes, shown as a segmented control for the selected body. */
const GIZMO_MODES: { mode: GizmoMode; label: string }[] = [
  { mode: "translate", label: "Move" },
  { mode: "rotate", label: "Rotate" },
  { mode: "scale", label: "Scale" },
]

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
  const uniform =
    Math.abs(scale.x - scale.y) < 1e-4 && Math.abs(scale.x - scale.z) < 1e-4
  return {
    parent: next,
    transform: {
      position: [position.x, position.y, position.z],
      rotation: [euler.x, euler.y, euler.z],
      scale: uniform ? scale.x : [scale.x, scale.y, scale.z],
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
        onClick={() =>
          updateBody(body.id, { joint: { pivot: [0, 0, 0], axis: [0, 1, 0], kind: "rotate" } })
        }
      >
        + Add joint
      </Button>
    )
  }
  const joint = body.joint
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Joint</span>
        <Button size="sm" variant="ghost" onClick={() => updateBody(body.id, { joint: undefined })}>
          Remove
        </Button>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Type</span>
        <select
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          value={joint.kind}
          onChange={(e) =>
            updateBody(body.id, {
              joint: { ...joint, kind: e.target.value === "slide" ? "slide" : "rotate" },
            })
          }
        >
          <option value="rotate">Rotate (hinge)</option>
          <option value="slide">Slide (rail)</option>
        </select>
      </label>
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

// ── Signal binding controls ─────────────────────────────────────────────────

type SignalOption = { value: string; label: string }

/** Every drivable simulator signal: a servo's angle or a custom-DSL signal. */
function useSignalOptions(): SignalOption[] {
  const components = useBoardSelector((ctx) => ctx.components)
  const options: SignalOption[] = []
  for (const component of Object.values(components)) {
    const name = component.name ?? component.type
    if (component.type === "servo") {
      options.push({ value: `${component.id}:angle`, label: `${name} — angle` })
    } else if (isCustomComponentType(component.type)) {
      for (const signal of getCustomDef(component.type)?.signalNames ?? []) {
        options.push({ value: `${component.id}:${signal}`, label: `${name} — ${signal}` })
      }
    }
  }
  return options
}

/** A signal picker + linear map for one binding channel of a body. */
function BindingRow({
  body,
  channel,
  title,
  unitHint,
}: {
  body: AssemblyBody
  channel: AssemblyBinding["channel"]
  title: string
  unitHint: string
}) {
  const assembly = useAssemblyDoc()
  const { setBodyBinding, clearBodyBinding } = useAssemblyActions()
  const options = useSignalOptions()
  const group = channel === "emissive" ? "emissive" : "joint"

  const binding = assembly.bindings.find(
    (b) =>
      b.bodyId === body.id &&
      (group === "emissive" ? b.channel === "emissive" : b.channel !== "emissive"),
  )
  if (options.length === 0 && !binding) return null

  const current = binding ? `${binding.componentId}:${binding.signal}` : ""

  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">{title}</span>
        <select
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          value={current}
          onChange={(e) => {
            const value = e.target.value
            if (!value) {
              clearBodyBinding(body.id, group)
              return
            }
            const separator = value.indexOf(":")
            const componentId = value.slice(0, separator)
            const signal = value.slice(separator + 1)
            setBodyBinding({
              id: `bind_${body.id}_${group}`,
              componentId,
              signal,
              bodyId: body.id,
              channel,
              map: binding?.map ?? { scale: 1, offset: 0 },
            })
          }}
        >
          <option value="">None</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {binding && (
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">{unitHint}</span>
          <div className="flex gap-1">
            {(["scale", "offset"] as const).map((key) => (
              <Input
                key={`${body.id}-${channel}-${key}-${binding.map[key]}`}
                type="number"
                className="h-7 text-xs"
                defaultValue={binding.map[key]}
                onBlur={(e) => {
                  const value = Number(e.target.value)
                  if (Number.isNaN(value)) return
                  setBodyBinding({ ...binding, map: { ...binding.map, [key]: value } })
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Joint + emissive bindings for the selected body. */
function BindingEditor({ body }: { body: AssemblyBody }) {
  const jointChannel = body.joint?.kind === "slide" ? "slide" : "rotate"
  const jointUnit =
    jointChannel === "slide" ? "mm = value × scale + offset" : "degrees = value × scale + offset"
  return (
    <div className="space-y-3">
      {body.joint && (
        <BindingRow
          body={body}
          channel={jointChannel}
          title="Joint driven by signal"
          unitHint={jointUnit}
        />
      )}
      <BindingRow
        body={body}
        channel="emissive"
        title="Glow driven by signal"
        unitHint="intensity 0–1 = value × scale + offset"
      />
    </div>
  )
}

/** Loop baked GLB clips (does nothing for STL bodies or files with no clips). */
function AnimationsEditor({ body }: { body: AssemblyBody }) {
  const { updateBody } = useAssemblyActions()
  if (body.format !== "glb") return null
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <input
        type="checkbox"
        checked={body.playAnimations ?? false}
        onChange={(e) => updateBody(body.id, { playAnimations: e.target.checked })}
      />
      Play baked animation clips
    </label>
  )
}

// ── Panel ───────────────────────────────────────────────────────────────────

export function AssemblyPanel({ onImport }: { onImport: () => void }) {
  const assembly = useAssemblyDoc()
  const { updateBody, duplicateBody, reorderBody, removeBody } = useAssemblyActions()
  const { selectedBodyId, select, mode, setMode } = useEditor()
  const components = useBoardSelector((ctx) => ctx.components)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  // Parent targets resolve against live scene nodes; refresh when they change.
  useSyncExternalStore(subscribeRegistry, getRegistryVersion, getRegistryVersion)

  const bodies = Object.values(assembly.bodies)
  const selected = selectedBodyId ? assembly.bodies[selectedBodyId] : undefined

  const mountableComponents = Object.values(components).filter(
    (component) => !isBoardComponentType(component.type),
  )

  function commitRename(id: string, value: string) {
    const name = value.trim()
    if (name) updateBody(id, { name })
    setRenamingId(null)
  }

  return (
    <div className="pointer-events-auto absolute left-2 top-14 flex max-h-[calc(100%-5rem)] w-64 flex-col overflow-y-auto rounded-lg border border-border bg-background/95 p-2 text-sm shadow-lg backdrop-blur">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">Scene</span>
        <button
          type="button"
          onClick={onImport}
          className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-medium text-primary hover:bg-muted"
          title="Upload a .glb or .stl model (e.g. a part you're about to 3D-print)"
        >
          <Plus className="h-3.5 w-3.5" />
          Add model
        </button>
      </div>

      {bodies.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
          <Box className="h-6 w-6 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">No models in this scene yet.</p>
          <Button size="sm" onClick={onImport}>
            <Plus className="h-3.5 w-3.5" />
            Add 3D model
          </Button>
          <p className="text-[10px] text-muted-foreground/70">
            or drag a .glb / .stl file onto the scene
          </p>
        </div>
      ) : (
        <ul className="max-h-48 space-y-0.5 overflow-y-auto">
          {bodies.map((body, index) => (
            <li
              key={body.id}
              className={cn(
                "flex items-center gap-0.5 rounded px-1 py-0.5 hover:bg-muted",
                body.id === selectedBodyId && "bg-muted",
              )}
            >
              {renamingId === body.id ? (
                <Input
                  autoFocus
                  defaultValue={body.name}
                  className="h-6 flex-1 text-xs"
                  onBlur={(e) => commitRename(body.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(body.id, e.currentTarget.value)
                    else if (e.key === "Escape") setRenamingId(null)
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={cn(
                    "min-w-0 flex-1 truncate text-left text-xs",
                    body.hidden && "text-muted-foreground/60",
                    body.id === selectedBodyId && "font-medium",
                  )}
                  onClick={() => select(body.id === selectedBodyId ? null : body.id)}
                  onDoubleClick={() => setRenamingId(body.id)}
                  title="Click to select · double-click to rename"
                >
                  {body.name}
                </button>
              )}

              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-25"
                onClick={() => reorderBody(body.id, "up")}
                disabled={index === 0}
                title="Move up"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-25"
                onClick={() => reorderBody(body.id, "down")}
                disabled={index === bodies.length - 1}
                title="Move down"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => updateBody(body.id, { hidden: !body.hidden })}
                title={body.hidden ? "Show" : "Hide"}
              >
                {body.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                className={cn(
                  "shrink-0 hover:text-foreground",
                  body.locked ? "text-amber-500" : "text-muted-foreground",
                )}
                onClick={() => updateBody(body.id, { locked: !body.locked })}
                title={body.locked ? "Unlock" : "Lock"}
              >
                {body.locked ? (
                  <Lock className="h-3.5 w-3.5" />
                ) : (
                  <Unlock className="h-3.5 w-3.5" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="mt-2 space-y-3 border-t border-border pt-2">
          <div className="flex gap-0.5 rounded-md bg-muted/60 p-0.5">
            {GIZMO_MODES.map((entry) => (
              <button
                key={entry.mode}
                type="button"
                className={cn(
                  "flex-1 rounded px-2 py-1 text-xs hover:bg-muted",
                  mode === entry.mode && "bg-background font-medium shadow-sm",
                )}
                onClick={() => setMode(entry.mode)}
              >
                {entry.label}
              </button>
            ))}
          </div>

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
                const nodes = getPartNodes(component.id)
                const options = [
                  <option key={`${component.id}-body`} value={`comp:${component.id}:body`}>
                    {label}
                  </option>,
                ]
                // Offer whichever moving nodes the part registered — so a body
                // can ride the servo horn, motor shaft, or stepper output.
                for (const option of movingMountOptions(component.type, {
                  angle: Boolean(nodes?.angleNode),
                  spin: Boolean(nodes?.spinNode),
                })) {
                  options.push(
                    <option
                      key={`${component.id}-${option.node}`}
                      value={`comp:${component.id}:${option.node}`}
                    >
                      {label} — {option.label}
                    </option>,
                  )
                }
                return options
              })}
            </select>
          </label>

          <JointEditor body={selected} />
          <BindingEditor body={selected} />
          <AnimationsEditor body={selected} />

          <div className="flex items-center justify-between">
            <Button size="sm" variant="ghost" onClick={() => duplicateBody(selected.id)}>
              Duplicate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-500"
              onClick={() => {
                removeBody(selected.id)
                select(null)
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      )}

      <AssetLibrary />
    </div>
  )
}
