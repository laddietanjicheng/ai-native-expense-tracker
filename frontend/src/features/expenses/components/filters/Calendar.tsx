import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { formatFullWeekdayDate, formatMonthLabel, getMonthMatrix, WEEKDAY_LABELS } from "@/lib/dates";

interface CalendarProps {
  year: number;
  month: number;
  todayISO: string;
  selectedFrom: string | null;
  selectedTo: string | null;
  onSelectDay: (iso: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

/** A small, pure single-month calendar grid; no date-picker library. */
export function Calendar({
  year,
  month,
  todayISO,
  selectedFrom,
  selectedTo,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
}: CalendarProps) {
  const cells = getMonthMatrix(year, month);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <IconButton aria-label="Previous month" onClick={onPrevMonth} className="h-8 w-8">
          <ChevronLeft size={18} aria-hidden="true" />
        </IconButton>
        <span className="text-sm font-extrabold">{formatMonthLabel(year, month)}</span>
        <IconButton aria-label="Next month" onClick={onNextMonth} className="h-8 w-8">
          <ChevronRight size={18} aria-hidden="true" />
        </IconButton>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="flex h-7 items-center justify-center text-xs font-bold text-slate-500">
            {label}
          </span>
        ))}
        {cells.map((cell, index) => {
          if (!cell) return <span key={`blank-${index}`} className="h-10 w-10" />;

          const isStart = cell.iso === selectedFrom;
          const isEnd = cell.iso === selectedTo;
          const isEdge = isStart || isEnd;
          const isInRange = Boolean(
            selectedFrom && selectedTo && cell.iso >= selectedFrom && cell.iso <= selectedTo
          );
          const isToday = cell.iso === todayISO;

          const bandRadius = isStart ? "rounded-l-full" : isEnd ? "rounded-r-full" : "";
          const dayClass = isEdge
            ? "bg-primary font-extrabold text-white"
            : isInRange
              ? "font-bold text-primary-700"
              : isToday
                ? "font-semibold text-slate-900 ring-1 ring-inset ring-slate-400"
                : "font-semibold text-slate-900";

          return (
            <span key={cell.iso} className={`flex h-10 justify-center ${isInRange ? `bg-primary-50 ${bandRadius}` : ""}`}>
              <button
                type="button"
                aria-label={formatFullWeekdayDate(cell.iso)}
                aria-pressed={isEdge}
                onClick={() => onSelectDay(cell.iso)}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-primary ${dayClass}`}
              >
                {cell.day}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
