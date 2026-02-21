import { forwardRef } from "react"
import { cn } from "@/lib/utils"

type LabelProps = React.ComponentPropsWithoutRef<"label">

const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          "text-[11px] font-semibold text-muted-foreground uppercase tracking-wide",
          className
        )}
        {...props}
      />
    )
  }
)
Label.displayName = "Label"

export { Label }
export type { LabelProps }
