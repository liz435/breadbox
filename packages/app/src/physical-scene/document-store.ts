import { useSyncExternalStore } from "react"
import type { PhysicalScene } from "@dreamer/schemas"

export type PhysicalDocument = Readonly<{
  projectId: string | null
  scene: PhysicalScene | null
  revision: number
}>

type Entry = {
  snapshot: PhysicalDocument
  past: Array<PhysicalScene | null>
  future: Array<PhysicalScene | null>
  persistedHash: string | undefined
}

const EMPTY: PhysicalDocument = { projectId: null, scene: null, revision: 0 }
const HISTORY_LIMIT = 100

function hashScene(scene: PhysicalScene | null | undefined): string {
  return JSON.stringify(scene)
}

/** Authored initial state only; runtime snapshots must never enter this store. */
export class PhysicalDocumentStore {
  private entries = new Map<string, Entry>()
  private current: Entry | undefined
  private listeners = new Set<() => void>()

  getState = (): PhysicalDocument => this.current?.snapshot ?? EMPTY

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  /** Hydrates once per project. Version rerenders and switching back preserve edits. */
  open(projectId: string, scene?: PhysicalScene | null): void {
    let entry = this.entries.get(projectId)
    if (!entry) {
      entry = {
        snapshot: { projectId, scene: structuredClone(scene ?? null), revision: 0 },
        past: [], future: [],
        persistedHash: hashScene(scene),
      }
      this.entries.set(projectId, entry)
    }
    if (this.current === entry) return
    this.current = entry
    this.emit()
  }

  /** Returns undefined when the authored scene is already acknowledged by the server. */
  getPersistableScene(): PhysicalScene | null | undefined {
    const entry = this.current
    if (!entry) return undefined
    const currentHash = entry.snapshot.scene === null && entry.persistedHash === undefined
      ? undefined
      : hashScene(entry.snapshot.scene)
    if (currentHash === entry.persistedHash) return undefined
    return structuredClone(entry.snapshot.scene)
  }

  /** Acknowledge only the scene that was actually sent. Newer edits stay dirty. */
  markSaved(scene: PhysicalScene | null): void {
    const entry = this.current
    if (!entry || hashScene(entry.snapshot.scene) !== hashScene(scene)) return
    entry.persistedHash = hashScene(scene)
  }

  close(): void {
    if (!this.current) return
    this.current = undefined
    this.emit()
  }

  /** Updaters receive a detached scene and must return the next scene (or null to delete). */
  edit(update: PhysicalScene | null | ((scene: PhysicalScene | null) => PhysicalScene | null)): void {
    const entry = this.current
    if (!entry) return
    const next = typeof update === "function" ? update(structuredClone(entry.snapshot.scene)) : update
    if (JSON.stringify(next) === JSON.stringify(entry.snapshot.scene)) return
    entry.past.push(entry.snapshot.scene)
    if (entry.past.length > HISTORY_LIMIT) entry.past.shift()
    entry.future = []
    this.publish(entry, structuredClone(next))
  }

  canUndo = (): boolean => (this.current?.past.length ?? 0) > 0
  canRedo = (): boolean => (this.current?.future.length ?? 0) > 0

  undo(): void {
    const entry = this.current
    if (!entry || entry.past.length === 0) return
    const scene = entry.past.pop()
    if (scene === undefined) return
    entry.future.push(entry.snapshot.scene)
    this.publish(entry, scene)
  }

  redo(): void {
    const entry = this.current
    if (!entry || entry.future.length === 0) return
    const scene = entry.future.pop()
    if (scene === undefined) return
    entry.past.push(entry.snapshot.scene)
    this.publish(entry, scene)
  }

  private publish(entry: Entry, scene: PhysicalScene | null): void {
    entry.snapshot = { ...entry.snapshot, scene, revision: entry.snapshot.revision + 1 }
    this.emit()
  }
}

export const physicalDocumentStore = new PhysicalDocumentStore()

export function usePhysicalDocument(): PhysicalDocument {
  return useSyncExternalStore(physicalDocumentStore.subscribe, physicalDocumentStore.getState, () => EMPTY)
}
