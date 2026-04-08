// ── Library Manager ─────────────────────────────────────────────────────────
//
// UI for managing custom Arduino libraries. Users can add, edit, and remove
// libraries that are available via #include "name" in their sketches.

import React, { useState, useCallback, useRef } from "react"
import { useBoard } from "@/store/board-context"
import type { CustomLibrary } from "@dreamer/schemas"
import { Plus, Trash2, ChevronDown, ChevronRight, Upload, FileCode } from "lucide-react"

function LibraryManagerInner() {
  const { state, send } = useBoard()
  const libs = state.customLibraries
  const libEntries = Object.entries(libs)

  const [expandedLib, setExpandedLib] = useState<string | null>(null)
  const [newLibName, setNewLibName] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAdd = useCallback(() => {
    const name = newLibName.trim()
    if (!name) return
    // Ensure .h extension
    const fileName = name.endsWith(".h") ? name : `${name}.h`
    if (fileName in libs) return // already exists

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
    <div className="flex h-full w-full flex-col bg-[#1e1e1e] text-zinc-300">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-700 px-3 py-1.5">
        <span className="text-xs font-semibold">Libraries</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            title="Upload .h / .cpp file"
          >
            <Upload className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            title="New library"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
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
        <div className="flex items-center gap-1 border-b border-neutral-700 px-3 py-1.5">
          <input
            type="text"
            value={newLibName}
            onChange={(e) => setNewLibName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd()
              if (e.key === "Escape") { setIsAdding(false); setNewLibName("") }
            }}
            placeholder="MyLibrary.h"
            className="flex-1 bg-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 outline-none"
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
            className="rounded px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Library list */}
      <div className="flex-1 overflow-y-auto">
        {/* Built-in libraries (read-only info) */}
        <div className="px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">Built-in</p>
          {["Servo.h", "LiquidCrystal.h", "EEPROM.h", "Wire.h", "SPI.h", "Stepper.h"].map((lib) => (
            <div key={lib} className="flex items-center gap-2 py-0.5 text-xs text-zinc-500">
              <FileCode className="size-3 shrink-0" />
              <span>{lib}</span>
            </div>
          ))}
        </div>

        {/* Custom libraries */}
        {libEntries.length > 0 && (
          <div className="px-3 py-2 border-t border-neutral-700">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">Custom</p>
            {libEntries.map(([name, lib]) => {
              const isExpanded = expandedLib === name
              return (
                <div key={name} className="mb-1">
                  {/* Library header */}
                  <div className="flex items-center gap-1 group">
                    <button
                      type="button"
                      onClick={() => setExpandedLib(isExpanded ? null : name)}
                      className="flex flex-1 items-center gap-1.5 rounded py-0.5 px-1 text-xs hover:bg-zinc-800"
                    >
                      {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                      <FileCode className="size-3 text-blue-400" />
                      <span className="text-zinc-200">{name}</span>
                      <span className="text-[10px] text-zinc-600 ml-auto">{lib.code.split("\n").length} lines</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(name)}
                      className="rounded p-0.5 text-zinc-600 opacity-0 group-hover:opacity-100 hover:bg-red-600/20 hover:text-red-400 transition-opacity"
                      title="Remove library"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>

                  {/* Expanded editor */}
                  {isExpanded && (
                    <div className="mt-1 mb-2">
                      <p className="text-[10px] text-zinc-500 mb-1 px-1">
                        Use <code className="text-blue-400">#include &quot;{name}&quot;</code> in your sketch
                      </p>
                      <textarea
                        value={lib.code}
                        onChange={(e) => handleCodeChange(name, e.target.value)}
                        className="w-full rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 font-mono text-xs text-zinc-300 outline-none focus:border-blue-500 resize-y"
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
            <p className="text-xs text-zinc-600">No custom libraries yet.</p>
            <p className="text-[10px] text-zinc-700 mt-1">
              Click + to create one, or upload a .h file.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export const LibraryManager = React.memo(LibraryManagerInner)
