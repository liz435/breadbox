// ── 3D Breadboard view (lazy chunk entry) ───────────────────────────────────
//
// Everything three.js-flavored lives behind this module so the main bundle
// stays clean: the Canvas scene, the import dialog (which parses model files
// with three's loaders), and the panel-local toolbar.

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { SceneRoot } from "./scene-root"
import { ImportModelDialog } from "./import-model-dialog"

export function Breadboard3dView() {
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="relative h-full w-full">
      <SceneRoot />

      <div className="absolute right-2 top-2">
        <Button
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          title="Upload a .glb or .stl model (e.g. a part you're about to 3D-print)"
        >
          Import 3D model
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".glb,.gltf,.stl"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) setPendingFile(file)
            e.target.value = ""
          }}
        />
      </div>

      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/40 px-2 py-0.5 text-[11px] text-white/80">
        drag to orbit · right-drag to pan · scroll to zoom
      </div>

      {pendingFile && (
        <ImportModelDialog file={pendingFile} onClose={() => setPendingFile(null)} />
      )}
    </div>
  )
}
