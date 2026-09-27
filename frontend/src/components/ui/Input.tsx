import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className = "", ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={`h-11 w-full rounded-lg border px-3 text-[15px] text-slate-900 outline-none transition-shadow focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-100)] ${
        invalid ? "border-danger" : "border-slate-300"
      } ${className}`}
      {...props}
    />
  );
});
