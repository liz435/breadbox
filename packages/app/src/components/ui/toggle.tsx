import { forwardRef } from "react"
import { Toggle as BaseToggle } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const toggleVariants = cva(
  "inline-flex items-center justify-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-transparent text-foreground hover:bg-accent data-[pressed]:bg-primary data-[pressed]:text-primary-foreground",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-accent data-[pressed]:bg-primary data-[pressed]:text-primary-foreground",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2 text-xs",
        lg: "h-10 px-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ToggleProps = React.ComponentPropsWithoutRef<typeof BaseToggle> &
  VariantProps<typeof toggleVariants>

const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <BaseToggle
        ref={ref}
        className={cn(toggleVariants({ variant, size, className }))}
        {...props}
      />
    )
  }
)
Toggle.displayName = "Toggle"

export { Toggle, toggleVariants }
export type { ToggleProps }
