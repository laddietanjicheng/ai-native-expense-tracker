"use client";

import { KeyboardEvent, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Calendar } from "./Calendar";
import {
  daySpan,
  formatDateRangeLabel,
  formatTypedDate,
  parseTypedDate,
  shiftMonth,
  todayISOInSingapore,
  type DatePresetOption,
} from "@/lib/dates";

export const PRESET_OPTIONS: { value: Exclude<DatePresetOption, "custom">; label: string }[] = [
  { value: "last_7_days", label: "Last 7 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "this_year", label: "This year" },
  { value: "all_time", label: "All time" },
];

/** Moves focus between sibling [role="radio"] buttons on ArrowUp/ArrowDown, wrapping around. */
function handleArrowKeys(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  const delta = event.key === "ArrowDown" ? 1 : -1;
  const nextIndex = (currentIndex + delta + items.length) % items.length;
  items[nextIndex]?.focus();
}

interface DateRangePickerProps {
  preset: DatePresetOption;
  customFrom: string | null;
  customTo: string | null;
  onApplyPreset: (preset: Exclude<DatePresetOption, "custom">) => void;
  onApplyCustom: (customFrom: string, customTo: string) => void;
  onCancel: () => void;
}

/**
 * Mounted fresh each time the popover opens, so all pending state simply
 * initializes from the current props -- no effect needed to "reset on open".
 */
export function DateRangePicker({
  preset,
  customFrom,
  customTo,
  onApplyPreset,
  onApplyCustom,
  onCancel,
}: DateRangePickerProps) {
  const startInputRef = useRef<HTMLInputElement>(null);
  const todayISO = todayISOInSingapore();
  const seed = customTo ?? customFrom ?? todayISO;

  const [pendingFrom, setPendingFrom] = useState<string | null>(customFrom);
  const [pendingTo, setPendingTo] = useState<string | null>(customTo);
  const [awaitingEnd, setAwaitingEnd] = useState(false);
  const [customActive, setCustomActive] = useState(preset === "custom");
  const [startText, setStartText] = useState(customFrom ? formatTypedDate(customFrom) : "");
  const [endText, setEndText] = useState(customTo ? formatTypedDate(customTo) : "");
  const [viewYear, setViewYear] = useState(() => Number(seed.split("-")[0]));
  const [viewMonth, setViewMonth] = useState(() => Number(seed.split("-")[1]));

  function selectDay(iso: string) {
    setCustomActive(true);
    if (!pendingFrom || !awaitingEnd || iso < pendingFrom) {
      setPendingFrom(iso);
      setPendingTo(iso);
      setStartText(formatTypedDate(iso));
      setEndText(formatTypedDate(iso));
      setAwaitingEnd(true);
      return;
    }
    setPendingTo(iso);
    setEndText(formatTypedDate(iso));
    setAwaitingEnd(false);
  }

  function commitStartText() {
    const parsed = parseTypedDate(startText);
    if (!parsed) {
      setStartText(pendingFrom ? formatTypedDate(pendingFrom) : "");
      return;
    }
    setCustomActive(true);
    setAwaitingEnd(false);
    const to = pendingTo && parsed > pendingTo ? parsed : pendingTo;
    setPendingFrom(parsed);
    setPendingTo(to);
    if (to !== pendingTo) setEndText(formatTypedDate(to ?? parsed));
  }

  function commitEndText() {
    const parsed = parseTypedDate(endText);
    if (!parsed) {
      setEndText(pendingTo ? formatTypedDate(pendingTo) : "");
      return;
    }
    setCustomActive(true);
    setAwaitingEnd(false);
    const from = pendingFrom && parsed < pendingFrom ? parsed : pendingFrom;
    setPendingTo(parsed);
    setPendingFrom(from);
    if (from !== pendingFrom) setStartText(formatTypedDate(from ?? parsed));
  }

  const pendingRangeLabel =
    pendingFrom && pendingTo
      ? formatDateRangeLabel({ date_from: pendingFrom, date_to: pendingTo })
      : "Select a range";
  const pendingDayCount = pendingFrom && pendingTo ? daySpan({ date_from: pendingFrom, date_to: pendingTo }) : null;

  return (
    <>
      <div className="flex">
        <div
          role="radiogroup"
          aria-label="Presets"
          onKeyDown={handleArrowKeys}
          className="flex w-44 flex-shrink-0 flex-col gap-0.5 border-r border-slate-100 p-3"
        >
          {PRESET_OPTIONS.map((option) => {
            const checked = !customActive && preset === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => onApplyPreset(option.value)}
                className={`flex w-full h-[38px] items-center justify-between rounded-lg px-3 text-left text-sm ${
                  checked
                    ? "bg-primary-50 font-extrabold text-primary-700"
                    : "font-semibold text-slate-700 hover:bg-slate-50"
                }`}
              >
                {option.label}
                {checked && <Check size={16} aria-hidden="true" />}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={customActive}
            onClick={() => startInputRef.current?.focus()}
            className={`flex w-full h-[38px] items-center justify-between rounded-lg px-3 text-left text-sm ${
              customActive
                ? "bg-primary-50 font-extrabold text-primary-700"
                : "font-semibold text-slate-700 hover:bg-slate-50"
            }`}
          >
            Custom range
            {customActive && <Check size={16} aria-hidden="true" />}
          </button>
        </div>

        <div className="flex flex-grow flex-col gap-3.5 px-5 py-4">
          <div className="flex items-end gap-2.5">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="date-filter-start" className="text-xs font-bold text-slate-600">
                Start date
              </label>
              <Input
                id="date-filter-start"
                ref={startInputRef}
                value={startText}
                placeholder="DD/MM/YYYY"
                className="h-10 text-sm font-semibold"
                onChange={(e) => setStartText(e.target.value)}
                onBlur={commitStartText}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitStartText();
                }}
              />
            </div>
            <span className="pb-2.5 text-slate-400" aria-hidden="true">
              →
            </span>
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="date-filter-end" className="text-xs font-bold text-slate-600">
                End date
              </label>
              <Input
                id="date-filter-end"
                value={endText}
                placeholder="DD/MM/YYYY"
                className="h-10 text-sm font-semibold"
                onChange={(e) => setEndText(e.target.value)}
                onBlur={commitEndText}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEndText();
                }}
              />
            </div>
          </div>
          <p className="-mt-1.5 text-xs leading-relaxed text-slate-500">
            Type a date or pick one below. Picking a day before the start date starts a new range.
          </p>
          <Calendar
            year={viewYear}
            month={viewMonth}
            todayISO={todayISO}
            selectedFrom={pendingFrom}
            selectedTo={pendingTo}
            onSelectDay={selectDay}
            onPrevMonth={() => {
              const prev = shiftMonth(viewYear, viewMonth, -1);
              setViewYear(prev.year);
              setViewMonth(prev.month);
            }}
            onNextMonth={() => {
              const next = shiftMonth(viewYear, viewMonth, 1);
              setViewYear(next.year);
              setViewMonth(next.month);
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2.5 rounded-b-xl border-t border-slate-100 bg-slate-50 px-4 py-3">
        <span className="text-sm font-extrabold">{pendingRangeLabel}</span>
        {pendingDayCount !== null && (
          <span className="text-[13px] text-slate-500">
            {pendingDayCount} {pendingDayCount === 1 ? "day" : "days"}
          </span>
        )}
        <Button variant="secondary" className="ml-auto h-[38px] px-3.5 text-sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="h-[38px] px-4 text-sm"
          onClick={() => pendingFrom && pendingTo && onApplyCustom(pendingFrom, pendingTo)}
          disabled={!pendingFrom || !pendingTo}
        >
          Apply
        </Button>
      </div>
    </>
  );
}
