// ── Library Manager ─────────────────────────────────────────────────────────
//
// UI for managing custom Arduino libraries. Users can add, edit, and remove
// libraries that are available via #include "name" in their sketches.
// Includes a "Browse" tab that searches the official Arduino Library Index.

import React, { useCallback, useEffect, useRef, useState } from "react"
import { useBoard } from "@/store/board-context"
import { API_ORIGIN } from "@dreamer/config"
import { useCapabilities } from "@/project/use-capabilities"
import { resolveFetchOptions } from "@/project/api-client"
import { Plus, Trash2, ChevronDown, ChevronRight, Upload, FileCode, Loader2, Package } from "lucide-react"
import { LibraryBrowser } from "./library-browser"

const BUILT_IN_LIBS = ["Servo.h", "LiquidCrystal.h", "EEPROM.h", "Wire.h", "SPI.h", "Stepper.h", "Adafruit_NeoPixel.h", "DHT.h", "IRremote.h", "Adafruit_SSD1306.h"]

type InstalledLibrary = {
  name: string
  version: string
  author?: string
  sentence?: string
}

function MyLibrariesTab() {
  const { state, send } = useBoard()
  const libs = state.customLibraries
  const libEntries = Object.entries(libs)

  const [expandedLib, setExpandedLib] = useState<string | null>(null)
  const [newLibName, setNewLibName] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { capabilities } = useCapabilities()

  // Installed-via-arduino-cli libraries: fetched from the backend on mount
  // (and refetched after uninstall). These are separate from `customLibraries`
  // which are the per-project user-authored libs; installed libs live in
  // arduino-cli's global cache and are shared across projects.
  const [installed, setInstalled] = useState<InstalledLibrary[]>([])
  const [installedLoaded, setInstalledLoaded] = useState(false)
  const [uninstalling, setUninstalling] = useState<Set<string>>(new Set())
  const [uninstallError, setUninstallError] = useState<Record<string, string>>({})

  const refreshInstalled = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_ORIGIN}/api/libraries/installed`,
        resolveFetchOptions(),
      )
      if (!res.ok) {
        setInstalled([])
        setInstalledLoaded(true)
        return
      }
      const data = (await res.json()) as { libraries?: InstalledLibrary[] }
      setInstalled(data.libraries ?? [])
      setInstalledLoaded(true)
    } catch {
      setInstalled([])
      setInstalledLoaded(true)
    }
  }, [])

  useEffect(() => { void refreshInstalled() }, [refreshInstalled])

  const handleUninstallInstalled = useCallback(
    async (name: string) => {
      setUninstalling((s) => { const next = new Set(s); next.add(name); return next })
      setUninstallError((e) => { const n = { ...e }; delete n[name]; return n })
      try {
        const res = await fetch(
          `${API_ORIGIN}/api/libraries/uninstall`,
          resolveFetchOptions({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          }),
        )
        const data = (await res.json()) as { success?: boolean; error?: string }
        if (!res.ok || !data.success) {
          setUninstallError((e) => ({ ...e, [name]: data.error ?? `HTTP ${res.status}` }))
        } else {
          await refreshInstalled()
        }
      } catch (err) {
        setUninstallError((e) => ({
          ...e,
          [name]: err instanceof Error ? err.message : String(err),
        }))
      } finally {
        setUninstalling((s) => { const next = new Set(s); next.delete(name); return next })
      }
    },
    [refreshInstalled],
  )

  const handleAdd = useCallback(() => {
    const name = newLibName.trim()
    if (!name) return
    const fileName = name.endsWith(".h") ? name : `${name}.h`
    if (fileName in libs) return

    send({
      type: "ADD_CUSTOM_LIBRARY",
      name: fileName,
      library: {
        name: fileName,
        code: `// ${fileName}\n// Write your library code here\n`,
        description: "",
      },
    })
    setNewLibName("")
    setIsAdding(false)
    setExpandedLib(fileName)
  }, [newLibName, libs, send])

  const handleRemove = useCallback((name: string) => {
    send({ type: "REMOVE_CUSTOM_LIBRARY", name })
    if (expandedLib === name) setExpandedLib(null)
  }, [send, expandedLib])

  const handleCodeChange = useCallback((name: string, code: string) => {
    const existing = libs[name]
    if (!existing) return
    send({
      type: "UPDATE_CUSTOM_LIBRARY",
      name,
      library: { ...existing, code },
    })
  }, [libs, send])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fileName = file.name.endsWith(".h") || file.name.endsWith(".cpp")
      ? file.name
      : `${file.name}.h`

    const reader = new FileReader()
    reader.onload = () => {
      const code = reader.result as string
      send({
        type: "ADD_CUSTOM_LIBRARY",
        name: fileName,
        library: { name: fileName, code, description: "" },
      })
      setExpandedLib(fileName)
    }
    reader.readAsText(file)
    e.target.value = ""
  }, [send])

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Action bar */}
      <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-b border-border">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Upload .h / .cpp file"
        >
          <Upload className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="New library"
        >
          <Plus className="size-3.5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".h,.cpp,.c,.hpp,.ino"
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>

      {/* New library input */}
      {isAdding && (
        <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
          <input
            type="text"
            value={newLibName}
            onChange={(e) => setNewLibName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd()
              if (e.key === "Escape") { setIsAdding(false); setNewLibName("") }
            }}
            placeholder="MyLibrary.h"
            className="flex-1 bg-secondary rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground outline-none"
            autoFocus
          />
          <button
            type="button"
            onClick={handleAdd}
            className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-emerald-500"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => { setIsAdding(false); setNewLibName("") }}
            className="rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Installed libraries (via Browse Index → arduino-cli).
          Hidden in hosted mode: the pre-baked list is identical for every
          user, doesn't change, and is already visible (greened out) in
          Browse Index. No point showing it twice. */}
      {!capabilities.hosted && (
        <div className="px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Installed <span className="font-normal normal-case text-muted-foreground">(from Browse Index)</span>
          </p>
          {!installedLoaded ? (
            <p className="text-[10px] text-muted-foreground italic py-0.5">Loading…</p>
          ) : installed.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic py-0.5">
              Nothing installed yet — open Browse Index and click the download icon on a library.
            </p>
          ) : (
            installed.map((lib) => {
              const isUninstalling = uninstalling.has(lib.name)
              const err = uninstallError[lib.name]
              return (
                <div key={lib.name} className="group py-0.5">
                  <div className="flex items-center gap-2 text-xs">
                    <Package className="size-3 shrink-0 text-sky-400" />
                    <span className="text-foreground truncate">{lib.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">v{lib.version}</span>
                    <div className="ml-auto shrink-0">
                      {isUninstalling ? (
                        <span className="flex items-center text-[10px] text-muted-foreground" title="Uninstalling…">
                          <Loader2 className="size-3 animate-spin" />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleUninstallInstalled(lib.name)}
                          className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-red-600/20 hover:text-red-400 transition-opacity"
                          title={`Uninstall ${lib.name}`}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {err && (
                    <p className="text-[10px] text-red-400 pl-5 mt-0.5 break-words">{err}</p>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Built-in libraries */}
      <div className="px-3 py-2 border-t border-border">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Built-in <span className="font-normal normal-case text-muted-foreground">(transpile-mode shims)</span>
        </p>
        {BUILT_IN_LIBS.map((lib) => (
          <div key={lib} className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground">
            <FileCode className="size-3 shrink-0" />
            <span>{lib}</span>
          </div>
        ))}
      </div>

      {/* Custom libraries */}
      {libEntries.length > 0 && (
        <div className="px-3 py-2 border-t border-border">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Custom</p>
          {libEntries.map(([name, lib]) => {
            const isExpanded = expandedLib === name
            return (
              <div key={name} className="mb-1">
                <div className="flex items-center gap-1 group">
                  <button
                    type="button"
                    onClick={() => setExpandedLib(isExpanded ? null : name)}
                    className="flex flex-1 items-center gap-1.5 rounded py-0.5 px-1 text-xs hover:bg-secondary"
                  >
                    {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    <FileCode className="size-3 text-blue-400" />
                    <span className="text-foreground">{name}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{lib.code.split("\n").length} lines</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(name)}
                    className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-red-600/20 hover:text-red-400 transition-opacity"
                    title="Remove library"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-1 mb-2">
                    <p className="text-[10px] text-muted-foreground mb-1 px-1">
                      Use <code className="text-blue-400">#include &quot;{name}&quot;</code> in your sketch
                    </p>
                    <textarea
                      value={lib.code}
                      onChange={(e) => handleCodeChange(name, e.target.value)}
                      className="w-full rounded bg-card border border-border px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-blue-500 resize-y"
                      rows={Math.min(20, Math.max(5, lib.code.split("\n").length + 1))}
                      spellCheck={false}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {libEntries.length === 0 && !isAdding && (
        <div className="px-3 py-4 text-center">
          <p className="text-xs text-muted-foreground">No custom libraries yet.</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Click + to create one, or upload a .h file.
          </p>
        </div>
      )}
    </div>
  )
}

function LibraryManagerInner() {
  // Default to "browse" — discovery + install is the more common first-time
  // action; curating your own per-project libraries is secondary.
  const [tab, setTab] = useState<"browse" | "mine">("browse")

  return (
    <div className="flex h-full w-full flex-col bg-card text-foreground">
      {/* Tab header */}
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setTab("browse")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium ${
            tab === "browse"
              ? "text-foreground border-b-2 border-blue-500"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Browse Index
        </button>
        <button
          type="button"
          onClick={() => setTab("mine")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium ${
            tab === "mine"
              ? "text-foreground border-b-2 border-blue-500"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          My Libraries
        </button>
      </div>

      {/* Tab content */}
      {tab === "browse" ? <LibraryBrowser /> : <MyLibrariesTab />}
    </div>
  )
}

export const LibraryManager = React.memo(LibraryManagerInner)
