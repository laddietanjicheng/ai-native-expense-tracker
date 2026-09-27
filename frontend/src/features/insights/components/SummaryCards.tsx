import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { centsToDisplay } from "@/lib/money";
import { STATUS_STYLES } from "../statusStyles";
import { isCurrentMonthKey, shiftMonthKey, shortMonthKeyLabel } from "../monthUtils";
import type { BudgetProgress, SummaryOut } from "../types";

interface SummaryCardsProps {
  summary: SummaryOut;
  overallBudget: BudgetProgress | undefined;
  monthKey: string;
  onEditBudgets: () => void;
}

function DeltaLine({ deltaCents, deltaPct, prevLabel }: { deltaCents: number; deltaPct: number | null; prevLabel: string }) {
  if (deltaCents === 0) {
    return <span className="text-[13px] font-semibold text-slate-500">No change from {prevLabel}</span>;
  }
  const isUp = deltaCents > 0;
  const Icon = isUp ? ArrowUp : ArrowDown;
  const pctText = deltaPct === null ? "" : ` (${Math.abs(Math.round(deltaPct))}%)`;
  return (
    <span className={`inline-flex items-center gap-1 text-[13px] font-semibold ${isUp ? "text-orange-700" : "text-blue-700"}`}>
      <Icon size={14} aria-hidden="true" />
      {centsToDisplay(Math.abs(deltaCents))}
      {pctText} {isUp ? "more" : "less"} than {prevLabel}
    </span>
  );
}

export function SummaryCards({ summary, overallBudget, monthKey, onEditBudgets }: SummaryCardsProps) {
  const isCurrent = isCurrentMonthKey(monthKey);
  const prevLabel = shortMonthKeyLabel(shiftMonthKey(monthKey, -1));

  return (
    <div className="grid grid-cols-3 gap-4">
      <Card label="Spent so far">
        <span className="text-[32px] font-extrabold tracking-tight tabular-nums">{centsToDisplay(summary.total_cents)}</span>
        <DeltaLine deltaCents={summary.delta_vs_prev_cents} deltaPct={summary.delta_vs_prev_pct} prevLabel={prevLabel} />
      </Card>

      <Card label={isCurrent ? "Projected month-end" : "Month total"}>
        <span className="text-[32px] font-extrabold tracking-tight tabular-nums">
          {centsToDisplay(isCurrent ? (summary.projected_cents ?? summary.total_cents) : summary.total_cents)}
        </span>
        <span className="text-[13px] text-slate-500">
          {isCurrent && `Day ${summary.days_elapsed} of ${summary.days_in_month} · `}
          3-month average {centsToDisplay(summary.avg3_cents)}
        </span>
      </Card>

      {overallBudget ? (
        <Card label="Overall budget" statusChip={overallBudget.status}>
          <span className="text-[32px] font-extrabold tracking-tight tabular-nums">
            {Math.round(overallBudget.pct)}%{" "}
            <span className="text-[15px] font-semibold tracking-normal text-slate-500">
              of {centsToDisplay(overallBudget.cap_cents)}
            </span>
          </span>
          <div
            role="progressbar"
            aria-label="Overall budget used"
            aria-valuenow={Math.round(overallBudget.pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 overflow-hidden rounded-full bg-slate-200"
          >
            <div
              className={`h-2 rounded-full ${STATUS_STYLES[overallBudget.status].barBg}`}
              style={{ width: `${Math.min(100, overallBudget.pct)}%` }}
            />
          </div>
        </Card>
      ) : (
        <Card label="Overall budget">
          <span className="text-sm text-slate-500">No overall budget set yet.</span>
          <Button variant="secondary" className="h-9 self-start px-3 text-sm" onClick={onEditBudgets}>
            Set a budget
          </Button>
        </Card>
      )}
    </div>
  );
}

function Card({
  label,
  statusChip,
  children,
}: {
  label: string;
  statusChip?: BudgetProgress["status"];
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white px-6 py-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">{label}</span>
        {statusChip && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLES[statusChip].chipBg} ${STATUS_STYLES[statusChip].chipFg}`}>
            {statusChip}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
