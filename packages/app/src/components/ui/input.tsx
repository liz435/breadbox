import { forwardRef } from "react"
import { Input as BaseInput } from "@base-ui/react/input"
import { cn } from "@/lib/utils"

type InputProps = React.ComponentPropsWithoutRef<typeof BaseInput>

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <BaseInput
        ref={ref}
        className={cn(
          "flex h-9 w-full rounded-md border border-border bg-input px-3 py-1 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus:border-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
export type { InputProps }
