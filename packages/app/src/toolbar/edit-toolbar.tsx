import { useRef } from "react"
import { MousePointer2, Upload, Grid3X3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useScene } from "@/store/scene-context"
import { createSprite } from "@/store/scene"
import { loadImageFromFile } from "@/utils/image-loader"
import { ShapesPopover } from "./shapes-popover"

export function EditToolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { state, send } = useScene()

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const img = await loadImageFromFile(file)
    send({ type: "ADD_SPRITE", sprite: createSprite(img, file.name) })
    e.target.value = ""
  }

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              onClick={() => send({ type: "SELECT", id: null })}
            />
          }
        >
          <MousePointer2 className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Pointer</TooltipContent>
      </Tooltip>

      <ShapesPopover />

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
            />
          }
        >
          <Upload className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Upload Image</TooltipContent>
      </Tooltip>

      {!state.tilemap && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  send({ type: "INIT_TILEMAP", width: 16, height: 12, tileSize: 48 })
                }
              />
            }
          >
            <Grid3X3 className="size-4" />
          </TooltipTrigger>
          <TooltipContent>New Tilemap</TooltipContent>
        </Tooltip>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
