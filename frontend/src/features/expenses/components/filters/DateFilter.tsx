"use client";

import { useRef } from "react";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { FilterTriggerButton } from "@/components/ui/FilterTriggerButton";
import { Popover } from "@/components/ui/Popover";
import { DateRangePicker, PRESET_OPTIONS } from "./DateRangePicker";
import {
  formatShortDayRange,
  formatShortMonthRange,
  resolveDatePreset,
  type DatePresetOption,
} from "@/lib/dates";

interface DateFilterProps {
  preset: DatePresetOption;
  customFrom: string | null;
  customTo: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyPreset: (preset: Exclude<DatePresetOption, "custom">) => void;
  onApplyCustom: (customFrom: string, customTo: string) => void;
}

/** Date filter trigger + popover: named presets apply immediately, a custom range applies via the footer. */
export function DateFilter({
  preset,
  customFrom,
  customTo,
  open,
  onOpenChange,
  onApplyPreset,
  onApplyCustom,
}: DateFilterProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  const resolvedRange = preset === "custom" || preset === "all_time" ? null : resolveDatePreset(preset);
  const label = preset === "custom" ? "Custom" : (PRESET_OPTIONS.find((o) => o.value === preset)?.label ?? "Date");
  const subtitle =
    preset === "custom" && customFrom && customTo
      ? formatShortDayRange({ date_from: customFrom, date_to: customTo })
      : resolvedRange?.date_from && resolvedRange.date_to
        ? formatShortMonthRange({ date_from: resolvedRange.date_from, date_to: resolvedRange.date_to })
        : null;

  return (
    <>
      <FilterTriggerButton
        ref={triggerRef}
        active={preset !== "this_month"}
        open={open}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <CalendarIcon size={16} aria-hidden="true" />
        {label}
        {subtitle && <span className="font-medium text-slate-600">· {subtitle}</span>}
        <ChevronDown size={16} className="text-slate-500" aria-hidden="true" />
      </FilterTriggerButton>

      <Popover
        open={open}
        onClose={() => onOpenChange(false)}
        anchorRef={triggerRef}
        label="Choose date range"
        widthClassName="w-[620px]"
      >
        {open && (
          <DateRangePicker
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            onApplyPreset={(value) => {
              onApplyPreset(value);
              onOpenChange(false);
            }}
            onApplyCustom={(from, to) => {
              onApplyCustom(from, to);
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </Popover>
    </>
  );
}
