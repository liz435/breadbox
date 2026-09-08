// ── 3D scene tuner state ─────────────────────────────────────────────────────
// Shared by the DOM controls and the react-three-fiber scene. Keeping this as
// a small external store lets the Components sidebar tune a Canvas that lives
// in a separate Dockview panel.

import { useSyncExternalStore } from "react"

export type SceneTunerState = {
  backgroundColor: string
  exposure: number
  hemisphereSkyColor: string
  hemisphereGroundColor: string
  hemisphereIntensity: number
  topLightColor: string
  topLightIntensity: number
  warmLightColor: string
  warmLightIntensity: number
  orangeLightColor: string
  orangeLightIntensity: number
}

export const DEFAULT_SCENE_TUNER: SceneTunerState = {
  backgroundColor: "#e5e2dc",
  exposure: 0.94,
  hemisphereSkyColor: "#f5f4f1",
  hemisphereGroundColor: "#696762",
  hemisphereIntensity: 0.58,
  topLightColor: "#fffaf2",
  topLightIntensity: 1.85,
  warmLightColor: "#e8ded2",
  warmLightIntensity: 0.62,
  orangeLightColor: "#d4dde7",
  orangeLightIntensity: 0.32,
}

// Bump the key so old warm/orange demo tuning cannot override the neutral
// presentation defaults on an existing browser profile.
const STORAGE_KEY = "dreamer:scene-tuner:v2"
const listeners = new Set<() => void>()

function readInitial(): SceneTunerState {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!saved) return DEFAULT_SCENE_TUNER
    return { ...DEFAULT_SCENE_TUNER, ...JSON.parse(saved) } as SceneTunerState
  } catch {
    return DEFAULT_SCENE_TUNER
  }
}

let state = readInitial()

function emit(): void {
  for (const listener of listeners) listener()
}

function persist(): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Non-browser / storage-denied: keep the in-memory tuning.
  }
}

export function getSceneTuner(): SceneTunerState {
  return state
}

export function subscribeSceneTuner(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setSceneTuner<K extends keyof SceneTunerState>(
  key: K,
  value: SceneTunerState[K],
): void {
  if (state[key] === value) return
  state = { ...state, [key]: value }
  persist()
  emit()
}

export function resetSceneTuner(): void {
  state = { ...DEFAULT_SCENE_TUNER }
  persist()
  emit()
}

export function useSceneTuner(): SceneTunerState {
  return useSyncExternalStore(subscribeSceneTuner, getSceneTuner, getSceneTuner)
}
