// ── WebGL context loss recovery ─────────────────────────────────────────────
//
// The desktop app runs in WKWebView, where the GPU process can drop the WebGL
// context under memory pressure or after the window is backgrounded. Two
// things have to happen for the canvas to come back:
//
//  1. `webglcontextlost` must be default-prevented. Otherwise the browser
//     never fires `webglcontextrestored` and the context is gone for good.
//  2. Once restored, something must render. three.js reinitialises its GL
//     state automatically, but the canvas runs at `frameloop="demand"`, so
//     without an explicit `invalidate()` no frame is ever scheduled and the
//     user stares at a frozen (or black) panel until they happen to orbit.
//
// Kept free of React so the listener wiring can be tested directly.

export type ContextRecoveryHandlers = {
  onLost?: () => void
  onRestored?: () => void
}

/**
 * Wire context-loss recovery onto a canvas. Returns a cleanup function that
 * removes both listeners.
 */
export function attachContextRecovery(
  canvas: {
    addEventListener: (type: string, listener: (event: Event) => void) => void
    removeEventListener: (type: string, listener: (event: Event) => void) => void
  },
  invalidate: () => void,
  handlers: ContextRecoveryHandlers = {},
): () => void {
  const handleLost = (event: Event) => {
    // Without this the context is never restorable.
    event.preventDefault()
    handlers.onLost?.()
  }

  const handleRestored = () => {
    handlers.onRestored?.()
    // Demand frameloop: nothing else will schedule a frame.
    invalidate()
  }

  canvas.addEventListener("webglcontextlost", handleLost)
  canvas.addEventListener("webglcontextrestored", handleRestored)

  return () => {
    canvas.removeEventListener("webglcontextlost", handleLost)
    canvas.removeEventListener("webglcontextrestored", handleRestored)
  }
}
