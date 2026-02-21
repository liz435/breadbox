import { useState, useCallback } from "react"
import { Popover } from "@base-ui/react/popover"
import { Shapes } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useScene } from "@/store/scene-context"
import { createSprite } from "@/store/scene"
import { templates, getTemplateImage, getTemplateThumbnail } from "@/utils/sprite-library"

export function ShapesPopover() {
  const { send } = useScene()
  const [open, setOpen] = useState(false)

  const handleTemplateClick = useCallback(
    async (index: number) => {
      const template = templates[index]
      const img = await getTemplateImage(template)
      send({ type: "ADD_SPRITE", sprite: createSprite(img, template.name) })
      setOpen(false)
    },
    [send]
  )

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip>
        <Popover.Trigger
          render={
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon" />
              }
            />
          }
        >
          <Shapes className="size-4" />
        </Popover.Trigger>
        <TooltipContent>Shapes</TooltipContent>
      </Tooltip>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={12} align="center">
          <Popover.Popup className="bg-card border border-border rounded-lg shadow-lg p-3 outline-none">
            <div className="grid grid-cols-4 gap-2">
              {templates.map((template, i) => (
                <button
                  key={template.name}
                  onClick={() => handleTemplateClick(i)}
                  className="flex flex-col items-center gap-1 rounded-md p-2 hover:bg-accent transition-colors cursor-pointer"
                >
                  <img
                    src={getTemplateThumbnail(template)}
                    alt={template.name}
                    className="size-10 object-contain"
                  />
                  <span className="text-[10px] text-muted-foreground leading-none">
                    {template.name}
                  </span>
                </button>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
