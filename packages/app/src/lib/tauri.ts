// ── Tauri desktop bridge ────────────────────────────────────────────────
//
// The web UI is served over http from the loopback sidecar and does NOT bundle
// @tauri-apps/api. When running inside the Tauri shell, the runtime injects an
// IPC global (window.__TAURI_INTERNALS__) into the webview; we use it directly.
// In a plain browser the global is absent and every call here is a no-op, so
// the same build runs unchanged outside the desktop app.

type TauriInternals = {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
};

function getInternals(): TauriInternals | null {
  if (typeof window === "undefined") return null;
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals })
    .__TAURI_INTERNALS__;
  return internals ?? null;
}

/** True when running inside the Tauri desktop shell. */
export function isDesktop(): boolean {
  return getInternals() !== null;
}

/**
 * Emit a Tauri event to the native process. No-op outside the desktop shell.
 * Mirrors @tauri-apps/api's `emit`, which invokes the core event plugin.
 */
export function emitToDesktop(event: string, payload: unknown): void {
  const internals = getInternals();
  if (!internals) return;
  void internals.invoke("plugin:event|emit", { event, payload }).catch(() => {
    // Best-effort: a rejected emit (e.g. missing permission) shouldn't surface.
  });
}
