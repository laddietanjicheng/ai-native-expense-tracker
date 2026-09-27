"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { isCurrentMonthKey, monthKeyLabel, shiftMonthKey } from "../monthUtils";

interface MonthSwitcherProps {
  monthKey: string;
  onChange: (monthKey: string) => void;
}

export function MonthSwitcher({ monthKey, onChange }: MonthSwitcherProps) {
  const isCurrent = isCurrentMonthKey(monthKey);

  return (
    <div
      role="group"
      aria-label="Month"
      className="flex h-11 items-center gap-1 rounded-lg border border-slate-300 bg-white px-1"
    >
      <IconButton aria-label="Previous month" onClick={() => onChange(shiftMonthKey(monthKey, -1))} className="h-9 w-9">
        <ChevronLeft size={18} aria-hidden="true" />
      </IconButton>
      <span className="min-w-[128px] text-center text-[15px] font-bold">{monthKeyLabel(monthKey)}</span>
      <IconButton
        aria-label="Next month"
        onClick={() => onChange(shiftMonthKey(monthKey, 1))}
        disabled={isCurrent}
        className="h-9 w-9"
      >
        <ChevronRight size={18} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
