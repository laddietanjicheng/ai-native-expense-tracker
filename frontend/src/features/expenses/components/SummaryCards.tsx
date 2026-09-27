import { centsToDisplay } from "@/lib/money";

interface SummaryCardsProps {
  totalAmountCents: number;
  totalCount: number;
  categoryCount: number;
  dateRangeLabel: string;
  /** Null for "all time", since there's no meaningful daily average without bounds. */
  dayCount: number | null;
}

export function SummaryCards({
  totalAmountCents,
  totalCount,
  categoryCount,
  dateRangeLabel,
  dayCount,
}: SummaryCardsProps) {
  const dailyAverageCents = dayCount && totalCount > 0 ? Math.round(totalAmountCents / dayCount) : null;

  return (
    <div className="grid grid-cols-3 gap-4">
      <SummaryCard label="Total spent" value={centsToDisplay(totalAmountCents)} caption={dateRangeLabel} />
      <SummaryCard
        label="Expenses"
        value={String(totalCount)}
        caption={`Across ${categoryCount} ${categoryCount === 1 ? "category" : "categories"}`}
      />
      <SummaryCard
        label="Daily average"
        value={dailyAverageCents === null ? "—" : centsToDisplay(dailyAverageCents)}
        caption={dayCount === null ? "Pick a date range" : `Over ${dayCount} ${dayCount === 1 ? "day" : "days"}`}
      />
    </div>
  );
}

function SummaryCard({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white px-6 py-5">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <span className="text-[32px] font-extrabold tracking-tight tabular-nums">{value}</span>
      <span className="text-[13px] text-slate-500">{caption}</span>
    </div>
  );
}
