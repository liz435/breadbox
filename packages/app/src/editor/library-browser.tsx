// ── Arduino Library Index Browser ────────────────────────────────────────
//
// Fetches the official Arduino library index JSON and provides a searchable
// list. Shows "Built-in" badges for libraries we have JS shims for, and
// allows adding placeholder custom libraries for discovery.

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { useBoard } from "@/store/board-context"
import { Search, Download, ExternalLink, Check } from "lucide-react"

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

function LibraryBrowserInner() {
  const [search, setSearch] = useState("")
  const [libraries, setLibraries] = useState<LibEntry[]>(cachedLibraries ?? [])
  const [loading, setLoading] = useState(!cachedLibraries)
  const [error, setError] = useState<string | null>(null)
  const { state, send } = useBoard()
  const abortRef = useRef<AbortController | null>(null)

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
    if (!search.trim()) {
      // Show built-in first, then popular categories
      return libraries
        .filter((lib) => BUILT_IN_LIBS.has(lib.name))
        .concat(
          libraries
            .filter((lib) => !BUILT_IN_LIBS.has(lib.name))
            .slice(0, 50)
        )
    }
    const q = search.toLowerCase()
    return libraries
      .filter(
        (lib) =>
          lib.name.toLowerCase().includes(q) ||
          lib.sentence.toLowerCase().includes(q) ||
          lib.author.toLowerCase().includes(q) ||
          lib.category.toLowerCase().includes(q),
      )
      .slice(0, 100)
  }, [search, libraries])

  const handleAddAsCustom = useCallback(
    (lib: LibEntry) => {
      const includeName = LIB_INCLUDE_MAP[lib.name] ?? `${lib.name.replace(/\s+/g, "_")}.h`
      if (includeName in state.customLibraries) return

      send({
        type: "ADD_CUSTOM_LIBRARY",
        name: includeName,
        library: {
          name: includeName,
          code: `// ${lib.name} v${lib.version}\n// Author: ${lib.author}\n// ${lib.sentence}\n//\n// This is a placeholder. Add your implementation or\n// use the built-in shim if available.\n//\n// Original: ${lib.url}\n`,
          description: lib.sentence,
        },
      })
    },
    [state.customLibraries, send],
  )

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
          const includeName = LIB_INCLUDE_MAP[lib.name]
          const isCustomAdded = includeName ? includeName in state.customLibraries : false

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
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-2">{lib.sentence}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-zinc-600">{lib.author}</span>
                    <span className="text-[9px] text-zinc-700">{lib.category}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 pt-0.5">
                  {isBuiltIn ? (
                    <span className="flex items-center gap-0.5 text-[10px] text-emerald-500">
                      <Check className="size-3" />
                    </span>
                  ) : isCustomAdded ? (
                    <span className="text-[10px] text-zinc-500">Added</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAddAsCustom(lib)}
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
                      title="Add as custom library"
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
