import { ButtonHTMLAttributes, forwardRef } from "react";

interface FilterTriggerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** True when this filter differs from its default value. */
  active?: boolean;
  /** True while this filter's popover is open. */
  open?: boolean;
}

/**
 * Compact dropdown trigger used in the filter bar: default / active (light
 * blue) / open (focused ring) styles, matching the filter bar redesign.
 */
export const FilterTriggerButton = forwardRef<HTMLButtonElement, FilterTriggerButtonProps>(
  function FilterTriggerButton({ active = false, open = false, className = "", ...props }, ref) {
    const stateClass = open
      ? "border-primary bg-white text-slate-900 shadow-[0_0_0_3px_var(--color-primary-100)]"
      : active
        ? "border-primary-200 bg-primary-50 text-primary-700"
        : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50";

    return (
      <button
        ref={ref}
        type="button"
        aria-haspopup="dialog"
        className={`inline-flex h-10 items-center gap-2 rounded-lg border pl-3 pr-2.5 text-sm font-bold ${stateClass} ${className}`}
        {...props}
      />
    );
  }
);
