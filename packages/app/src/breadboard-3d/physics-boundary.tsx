// ── Physics failure containment ──────────────────────────────────────────────
//
// <Physics> loads Rapier's WASM lazily and suspends on it. If that load
// rejects — CSP, offline, a corrupt cache in WKWebView — the rejection escapes
// the Canvas and hits the panel-level ErrorBoundary, which replaces the ENTIRE
// 3D view. That takes the "Physics: On/Off" toggle down with it, and since the
// flag is persisted in localStorage the panel then crashes again on every
// launch, with no in-UI way to recover.
//
// This boundary keeps the blast radius at the physics subtree: it turns the
// flag off (so the next launch is clean), tells the user, and lets SceneRoot
// fall back to the deterministic grid-driven scene, which needs no Rapier.

import { Component } from "react"
import type { ReactNode } from "react"
import { setPhysicsEnabled } from "./physics-flag"
import { resetPhysicsActivity } from "./physics-activity"
import { toast } from "@/components/ui/toast"

export class PhysicsErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    console.warn("[breadboard-3d] physics failed to start:", error)
    // The stepper never mounted (or just died), so nothing else will clear the
    // activity signal — leaving the canvas pinned at frameloop="always".
    resetPhysicsActivity()
    setPhysicsEnabled(false)
    toast.error("Physics could not start — falling back to the static scene")
  }

  render(): ReactNode {
    // A DOM fallback can't render inside the Canvas; SceneRoot re-renders the
    // grid-driven parts and wires once the flag flips off.
    return this.state.failed ? null : this.props.children
  }
}
