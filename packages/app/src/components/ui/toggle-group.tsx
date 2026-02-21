import { forwardRef } from "react"
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group"
import { cn } from "@/lib/utils"

type ToggleGroupProps = React.ComponentPropsWithoutRef<typeof BaseToggleGroup>

const ToggleGroup = forwardRef<HTMLDivElement, ToggleGroupProps>(
  ({ className, ...props }, ref) => {
    return (
      <BaseToggleGroup
        ref={ref}
        className={cn(
          "flex items-center rounded-md overflow-hidden border border-border",
          className
        )}
        {...props}
      />
    )
  }
)
ToggleGroup.displayName = "ToggleGroup"

export { ToggleGroup }
export type { ToggleGroupProps }
