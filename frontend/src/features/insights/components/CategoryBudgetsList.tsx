import { centsToDisplay } from "@/lib/money";
import { STATUS_STYLES } from "../statusStyles";
import type { BudgetProgress } from "../types";

interface CategoryBudgetsListProps {
  budgets: BudgetProgress[];
  categoriesWithoutBudget: string[];
  onEdit: () => void;
}

function noteFor(budget: BudgetProgress): string {
  if (budget.status === "Over") {
    return `${centsToDisplay(budget.spent_cents - budget.cap_cents)} over`;
  }
  return budget.projected_cents !== null ? `Projected ${centsToDisplay(budget.projected_cents)}` : "";
}

export function CategoryBudgetsList({ budgets, categoriesWithoutBudget, onEdit }: CategoryBudgetsListProps) {
  return (
    <section aria-labelledby="budgets-title" className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white px-6 pb-3 pt-4.5">
      <div className="flex items-center justify-between pb-1.5">
        <h2 id="budgets-title" className="text-[17px] font-extrabold">
          Category budgets
        </h2>
        <button type="button" onClick={onEdit} className="text-sm font-bold text-primary hover:text-primary-hover">
          Edit
        </button>
      </div>

      {budgets.length === 0 && <p className="py-3 text-sm text-slate-500">No category budgets set yet.</p>}

      {budgets.map((budget) => (
        <div key={budget.category_id} className="flex flex-col gap-2 border-b border-slate-100 py-3.5 last:border-b-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-bold">{budget.name}</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLES[budget.status].chipBg} ${STATUS_STYLES[budget.status].chipFg}`}
            >
              {budget.status}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`${budget.name} budget used`}
            aria-valuenow={Math.round(budget.pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 overflow-hidden rounded-full bg-slate-200"
          >
            <div className={`h-2 rounded-full ${STATUS_STYLES[budget.status].barBg}`} style={{ width: `${Math.min(100, budget.pct)}%` }} />
          </div>
          <div className="flex justify-between text-[13px] tabular-nums text-slate-600">
            <span>
              <strong className="text-slate-900">{centsToDisplay(budget.spent_cents)}</strong> of {centsToDisplay(budget.cap_cents)}
            </span>
            <span>{noteFor(budget)}</span>
          </div>
        </div>
      ))}

      {categoriesWithoutBudget.length > 0 && (
        <p className="pt-2 text-[13px] text-slate-500">{categoriesWithoutBudget.join(", ")} have no budget.</p>
      )}
    </section>
  );
}
