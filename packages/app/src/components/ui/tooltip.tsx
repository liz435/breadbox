import { forwardRef } from "react"
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip"
import { cn } from "@/lib/utils"

const TooltipProvider = BaseTooltip.Provider

const Tooltip = BaseTooltip.Root

const TooltipTrigger = BaseTooltip.Trigger

type TooltipContentProps = React.ComponentPropsWithoutRef<typeof BaseTooltip.Popup> & {
  sideOffset?: number
}

const TooltipContent = forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ className, sideOffset = 8, children, ...props }, ref) => {
    return (
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner sideOffset={sideOffset}>
          <BaseTooltip.Popup
            ref={ref}
            className={cn(
              "bg-popover text-popover-foreground text-xs px-2 py-1 rounded-md border border-border shadow-lg",
              className
            )}
            {...props}
          >
            {children}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    )
  }
)
TooltipContent.displayName = "TooltipContent"

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
