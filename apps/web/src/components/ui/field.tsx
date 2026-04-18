import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Form field wrapper — composes Label + control + hint/error in a tidy vertical
 * stack. Use as a sibling of shadcn <Input>, <Textarea>, etc.
 *
 * Example:
 *   <Field>
 *     <FieldLabel required>ชื่อเรื่อง</FieldLabel>
 *     <Input placeholder="ชื่อเรื่อง" />
 *     <FieldHint>รายละเอียดสั้น ๆ</FieldHint>
 *     <FieldError>ต้องระบุชื่อเรื่อง</FieldError>
 *   </Field>
 */
const Field = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1.5", className)} {...props} />
  ),
);
Field.displayName = "Field";

interface FieldLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}
const FieldLabel = React.forwardRef<HTMLLabelElement, FieldLabelProps>(
  ({ className, required, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("text-sm font-semibold text-on-surface-variant", className)}
      {...props}
    >
      {children}
      {required && <span className="ml-1 text-error">*</span>}
    </label>
  ),
);
FieldLabel.displayName = "FieldLabel";

const FieldHint = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-xs text-on-surface-variant/80", className)} {...props} />
  ),
);
FieldHint.displayName = "FieldHint";

const FieldError = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} role="alert" className={cn("text-xs font-medium text-error", className)} {...props} />
  ),
);
FieldError.displayName = "FieldError";

export { Field, FieldLabel, FieldHint, FieldError };
