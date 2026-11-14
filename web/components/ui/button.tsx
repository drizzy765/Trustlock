import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

// Hover changes colour and border only. Press scales 0.985 in 90 ms. Never transition: all.
export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[8px] border font-medium transition-[background-color,border-color,color,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.985] active:duration-[90ms] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bone [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "border-bone bg-bone text-ink-950 hover:border-bone/85 hover:bg-bone/85",
        secondary: "border-line-strong bg-transparent text-bone hover:border-faint hover:bg-ink-800",
        ghost: "border-transparent bg-transparent text-mute hover:bg-ink-800 hover:text-bone",
        danger: "border-danger bg-danger text-ink-950 hover:border-danger/85 hover:bg-danger/85",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-[15px]",
        lg: "h-[52px] px-6 text-base",
        icon: "size-11",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, loading, disabled, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  )
);
Button.displayName = "Button";
