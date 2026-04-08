// ── Toast Notification System ───────────────────────────────────────────────
//
// Lightweight toast system. Call `toast.success()`, `toast.error()`, etc.
// from anywhere. Renders a fixed overlay at the bottom-right.

import { useState, useEffect, useCallback, useSyncExternalStore } from "react"
import { cn } from "@/utils/classnames"

type ToastType = "success" | "error" | "warning" | "info"

type ToastItem = {
  id: number
  type: ToastType
  message: string
  duration: number
}

// ── Store ────────────────────────────────────────────────────────────────

let nextId = 0
let items: ToastItem[] = []
const listeners = new Set<() => void>()

function notify() {
  for (const fn of listeners) fn()
}

function addToast(type: ToastType, message: string, duration = 4000) {
  const id = nextId++
  items = [...items, { id, type, message, duration }]
  notify()
  if (duration > 0) {
    setTimeout(() => removeToast(id), duration)
  }
}

function removeToast(id: number) {
  items = items.filter((t) => t.id !== id)
  notify()
}

/** Global toast API — call from anywhere, no hooks needed. */
export const toast = {
  success: (msg: string, duration?: number) => addToast("success", msg, duration),
  error: (msg: string, duration?: number) => addToast("error", msg, duration ?? 6000),
  warning: (msg: string, duration?: number) => addToast("warning", msg, duration ?? 5000),
  info: (msg: string, duration?: number) => addToast("info", msg, duration),
}

// ── React Component ──────────────────────────────────────────────────────

const typeStyles: Record<ToastType, string> = {
  success: "bg-emerald-600/90 border-emerald-500/50 text-white",
  error: "bg-red-600/90 border-red-500/50 text-white",
  warning: "bg-yellow-600/90 border-yellow-500/50 text-white",
  info: "bg-blue-600/90 border-blue-500/50 text-white",
}

const typeIcons: Record<ToastType, string> = {
  success: "\u2713",
  error: "\u2717",
  warning: "\u26A0",
  info: "\u2139",
}

function ToastItem({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-4 py-2.5 shadow-lg backdrop-blur-sm transition-all duration-300",
        typeStyles[item.type],
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
    >
      <span className="text-sm font-bold shrink-0">{typeIcons[item.type]}</span>
      <span className="text-sm flex-1">{item.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded p-0.5 text-white/60 hover:text-white/90 transition-colors"
      >
        <svg viewBox="0 0 16 16" className="size-3 fill-current">
          <path d="M4.3 3.3a1 1 0 00-1.4 1.4L6.6 8l-3.7 3.3a1 1 0 101.4 1.4L8 9.4l3.3 3.3a1 1 0 001.4-1.4L9.4 8l3.3-3.3a1 1 0 00-1.4-1.4L8 6.6 4.7 3.3z" />
        </svg>
      </button>
    </div>
  )
}

export function ToastContainer() {
  const toasts = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => { listeners.delete(cb) }
    },
    () => items,
  )

  const handleDismiss = useCallback((id: number) => {
    removeToast(id)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-16 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem item={t} onDismiss={() => handleDismiss(t.id)} />
        </div>
      ))}
    </div>
  )
}
