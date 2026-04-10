import { forwardRef } from "react"
import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area"
import { cn } from "@/lib/utils"

type ScrollAreaProps = React.ComponentPropsWithoutRef<typeof BaseScrollArea.Root>

const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <BaseScrollArea.Root
        ref={ref}
        className={cn("relative overflow-hidden", className)}
        {...props}
      >
        <BaseScrollArea.Viewport className="h-full max-h-[inherit] w-full overflow-y-auto">
          {children}
        </BaseScrollArea.Viewport>
        <BaseScrollArea.Scrollbar
          orientation="vertical"
          className="flex w-1.5 touch-none p-px transition-opacity select-none"
        >
          <BaseScrollArea.Thumb className="relative flex-1 rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/50 transition-colors" />
        </BaseScrollArea.Scrollbar>
      </BaseScrollArea.Root>
    )
  }
)
ScrollArea.displayName = "ScrollArea"

export { ScrollArea }
export type { ScrollAreaProps }
