import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-xl border px-4 py-3 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4 [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        info: "border-primary/30 bg-primary/5 text-on-surface [&>svg]:text-primary",
        success: "border-emerald-500/30 bg-emerald-500/10 text-on-surface [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400",
        warning: "border-amber-500/30 bg-amber-500/10 text-on-surface [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400",
        error: "border-error/40 bg-error/10 text-on-surface [&>svg]:text-error",
        neutral: "border-outline-variant bg-surface-low text-on-surface [&>svg]:text-on-surface-variant",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  ),
);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn("mb-1 font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  ),
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("text-sm text-on-surface-variant [&_p]:leading-relaxed", className)}
      {...props}
    />
  ),
);
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription, alertVariants };
