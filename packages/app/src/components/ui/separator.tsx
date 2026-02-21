import { forwardRef } from "react"
import { Separator as BaseSeparator } from "@base-ui/react/separator"
import { cn } from "@/lib/utils"

type SeparatorProps = React.ComponentPropsWithoutRef<typeof BaseSeparator>

const Separator = forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, ...props }, ref) => {
    return (
      <BaseSeparator
        ref={ref}
        className={cn(
          props.orientation === "vertical"
            ? "h-full w-px bg-border"
            : "h-px w-full bg-border",
          className
        )}
        {...props}
      />
    )
  }
)
Separator.displayName = "Separator"

export { Separator }
export type { SeparatorProps }
