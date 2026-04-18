// ── Arduino Library Index Browser ────────────────────────────────────────
//
// Fetches the official Arduino library index JSON and provides a searchable
// list. Shows "Built-in" badges for libraries we have JS shims for and
// installs third-party libraries through the backend via
// POST /api/libraries/install (which wraps `arduino-cli lib install`).
// Installed libraries appear with a checkmark; install runs in the
// background with a spinner.

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { useBoard } from "@/store/board-context"
import { API_ORIGIN } from "@dreamer/config"
import { useCapabilities } from "@/project/use-capabilities"
import { Search, Download, ExternalLink, Check, Loader2, AlertCircle, Trash2, Lock } from "lucide-react"

const LIBRARY_INDEX_URL = "https://downloads.arduino.cc/libraries/library_index.json"

const BUILT_IN_LIBS = new Set([
  "Servo", "LiquidCrystal", "EEPROM", "Wire", "SPI", "Stepper",
  "Adafruit NeoPixel", "DHT sensor library", "IRremote", "Adafruit SSD1306",
])

// Map index names to our #include names
const LIB_INCLUDE_MAP: Record<string, string> = {
  "Servo": "Servo.h",
  "LiquidCrystal": "LiquidCrystal.h",
  "EEPROM": "EEPROM.h",
  "Wire": "Wire.h",
  "SPI": "SPI.h",
  "Stepper": "Stepper.h",
  "Adafruit NeoPixel": "Adafruit_NeoPixel.h",
  "DHT sensor library": "DHT.h",
  "IRremote": "IRremote.h",
  "Adafruit SSD1306": "Adafruit_SSD1306.h",
}

type LibEntry = {
  name: string
  version: string
  author: string
  sentence: string
  paragraph: string
  category: string
  url: string
  architectures: string[]
}

type IndexData = {
  libraries: Array<{
    name: string
    version: string
    author: string
    sentence: string
    paragraph: string
    category: string
    url: string
    architectures: string[]
  }>
}

// Deduplicate to latest version per library name
function deduplicateLibraries(raw: IndexData["libraries"]): LibEntry[] {
  const map = new Map<string, LibEntry>()
  for (const lib of raw) {
    const existing = map.get(lib.name)
    if (!existing || lib.version > existing.version) {
      map.set(lib.name, lib)
    }
  }
  return [...map.values()]
}

// Cache in module scope so refetching isn't needed on re-mount
let cachedLibraries: LibEntry[] | null = null

/** Per-library install state tracked in this component. */
type InstallState = "idle" | "installing" | "uninstalling" | "error"

function LibraryBrowserInner() {
  const [search, setSearch] = useState("")
  const [libraries, setLibraries] = useState<LibEntry[]>(cachedLibraries ?? [])
  const [loading, setLoading] = useState(!cachedLibraries)
  const [error, setError] = useState<string | null>(null)
  const { state } = useBoard()
  const abortRef = useRef<AbortController | null>(null)
  const { capabilities } = useCapabilities()

  // Map of installed library names (from `arduino-cli lib list` via API).
  // Populated on mount + after every successful install. Empty set if the
  // backend doesn't have arduino-cli available.
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const [installState, setInstallState] = useState<Record<string, InstallState>>({})
  const [installErrors, setInstallErrors] = useState<Record<string, string>>({})

  const refreshInstalled = useCallback(async () => {
    try {
      const res = await fetch(`${API_ORIGIN}/api/libraries/installed`)
      if (!res.ok) return
      const data = (await res.json()) as { libraries?: Array<{ name: string }> }
      setInstalled(new Set((data.libraries ?? []).map((l) => l.name)))
    } catch {
      // API not reachable — leave installed empty, install buttons still show.
    }
  }, [])

  useEffect(() => { void refreshInstalled() }, [refreshInstalled])

  /**
   * Install or uninstall a library via the backend. `op` picks the route
   * and status label. Success refreshes the installed list so the UI
   * transitions Download ↔ Check without waiting for another poll.
   */
  const runLibOp = useCallback(
    async (lib: LibEntry, op: "install" | "uninstall") => {
      setInstallState((s) => ({
        ...s,
        [lib.name]: op === "install" ? "installing" : "uninstalling",
      }))
      setInstallErrors((e) => {
        const next = { ...e }
        delete next[lib.name]
        return next
      })
      try {
        const res = await fetch(`${API_ORIGIN}/api/libraries/${op}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: lib.name }),
        })
        const data = (await res.json()) as { success?: boolean; error?: string }
        if (!res.ok || !data.success) {
          setInstallState((s) => ({ ...s, [lib.name]: "error" }))
          setInstallErrors((e) => ({
            ...e,
            [lib.name]: data.error ?? `HTTP ${res.status}`,
          }))
          return
        }
        setInstallState((s) => {
          const next = { ...s }
          delete next[lib.name]
          return next
        })
        await refreshInstalled()
      } catch (err) {
        setInstallState((s) => ({ ...s, [lib.name]: "error" }))
        setInstallErrors((e) => ({
          ...e,
          [lib.name]: err instanceof Error ? err.message : String(err),
        }))
      }
    },
    [refreshInstalled],
  )

  const handleInstall = useCallback(
    (lib: LibEntry) => runLibOp(lib, "install"),
    [runLibOp],
  )
  const handleUninstall = useCallback(
    (lib: LibEntry) => runLibOp(lib, "uninstall"),
    [runLibOp],
  )

  useEffect(() => {
    if (cachedLibraries) return

    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    fetch(LIBRARY_INDEX_URL, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: IndexData) => {
        const deduped = deduplicateLibraries(data.libraries)
        cachedLibraries = deduped
        setLibraries(deduped)
        setLoading(false)
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError("Failed to load library index")
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [])

  const filtered = useMemo(() => {
    // Ordering priority: already-installed > built-in shim > everything else.
    // Applies to both hosted and local modes — it's just a better UX for
    // users to see what they can actually use first.
    const rank = (lib: LibEntry): number => {
      if (installed.has(lib.name)) return 0
      if (BUILT_IN_LIBS.has(lib.name)) return 1
      return 2
    }
    const sortByRank = (list: LibEntry[]) =>
      [...list].sort((a, b) => rank(a) - rank(b))

    if (!search.trim()) {
      // Curated default view: installed + built-ins, then a preview of the
      // rest (capped so the first render isn't a 7,000-row scroll).
      const top = libraries.filter((lib) => rank(lib) < 2)
      const rest = libraries.filter((lib) => rank(lib) === 2).slice(0, 50)
      return sortByRank(top.concat(rest))
    }
    const q = search.toLowerCase()
    const hits = libraries
      .filter(
        (lib) =>
          lib.name.toLowerCase().includes(q) ||
          lib.sentence.toLowerCase().includes(q) ||
          lib.author.toLowerCase().includes(q) ||
          lib.category.toLowerCase().includes(q),
      )
      .slice(0, 100)
    return sortByRank(hits)
  }, [search, libraries, installed])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="size-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
        <span className="ml-2 text-xs text-zinc-500">Loading library index...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-xs text-red-400">{error}</p>
        <p className="text-[10px] text-zinc-600 mt-1">Check your internet connection.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="flex items-center gap-2 border-b border-neutral-700 px-3 py-1.5">
        <Search className="size-3.5 text-zinc-500 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Arduino libraries..."
          className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-600 outline-none"
        />
        <span className="text-[10px] text-zinc-600">{libraries.length.toLocaleString()} libs</span>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-zinc-600">
            No libraries match &quot;{search}&quot;
          </p>
        )}
        {filtered.map((lib) => {
          const isBuiltIn = BUILT_IN_LIBS.has(lib.name)
          const isInstalled = installed.has(lib.name)
          const currentInstall = installState[lib.name] ?? "idle"
          const installError = installErrors[lib.name]

          return (
            <div
              key={lib.name}
              className="border-b border-neutral-800 px-3 py-2 hover:bg-neutral-800/50"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-zinc-200 truncate">{lib.name}</span>
                    <span className="text-[10px] text-zinc-600">v{lib.version}</span>
                    {isBuiltIn && (
                      <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
                        Built-in
                      </span>
                    )}
                    {isInstalled && !isBuiltIn && (
                      <span className="rounded bg-sky-900/40 px-1.5 py-0.5 text-[9px] font-medium text-sky-400">
                        Installed
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-2">{lib.sentence}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-zinc-600">{lib.author}</span>
                    <span className="text-[9px] text-zinc-700">{lib.category}</span>
                  </div>
                  {installError && (
                    <p className="text-[10px] text-red-400 mt-1 flex items-start gap-1">
                      <AlertCircle className="size-3 shrink-0 mt-0.5" />
                      <span className="break-words">{installError}</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0 pt-0.5">
                  {isBuiltIn ? (
                    // Transpiler shims — always present, can't uninstall.
                    <span className="flex items-center gap-0.5 text-[10px] text-emerald-500" title="Built-in">
                      <Check className="size-3" />
                    </span>
                  ) : currentInstall === "installing" ? (
                    <span className="flex items-center gap-0.5 text-[10px] text-zinc-400" title="Installing…">
                      <Loader2 className="size-3 animate-spin" />
                    </span>
                  ) : currentInstall === "uninstalling" ? (
                    <span className="flex items-center gap-0.5 text-[10px] text-zinc-400" title="Uninstalling…">
                      <Loader2 className="size-3 animate-spin" />
                    </span>
                  ) : isInstalled ? (
                    capabilities.hosted ? (
                      // Hosted: library set is fixed. Show a static checkmark
                      // so users see it's available without the "click to
                      // uninstall" affordance that would 403.
                      <span className="flex items-center gap-0.5 text-[10px] text-emerald-500" title="Pre-installed">
                        <Check className="size-3" />
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleUninstall(lib)}
                        className="group rounded p-1 text-emerald-500 hover:bg-red-900/30 hover:text-red-400"
                        title={`Uninstall ${lib.name}`}
                      >
                        <Check className="size-3 group-hover:hidden" />
                        <Trash2 className="size-3 hidden group-hover:block" />
                      </button>
                    )
                  ) : capabilities.hosted ? (
                    // Hosted + not in the pre-baked set → static "CLI only"
                    // pill. Tooltip tells the user where to get it.
                    <span
                      className="flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-500"
                      title="Not pre-installed on this hosted Dreamer. Download the Dreamer CLI to install arbitrary libraries."
                    >
                      <Lock className="size-2.5" /> CLI only
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleInstall(lib)}
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
                      title={`Install ${lib.name} via arduino-cli`}
                    >
                      <Download className="size-3" />
                    </button>
                  )}
                  {lib.url && (
                    <a
                      href={lib.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1 text-zinc-600 hover:bg-zinc-700 hover:text-zinc-400"
                      title="View on GitHub"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const LibraryBrowser = React.memo(LibraryBrowserInner)
