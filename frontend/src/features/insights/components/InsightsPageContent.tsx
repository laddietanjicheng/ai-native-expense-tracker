"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useInsights } from "../hooks";
import { useBudgets } from "@/features/budgets/hooks";
import { BudgetsDialog } from "@/features/budgets/components/BudgetsDialog";
import { MonthSwitcher } from "./MonthSwitcher";
import { SummaryCards } from "./SummaryCards";
import { NarrationSection } from "./NarrationSection";
import { ChangesTable } from "./ChangesTable";
import { CategoryBudgetsList } from "./CategoryBudgetsList";
import { currentMonthKey, shiftMonthKey, shortMonthKeyLabel } from "../monthUtils";
import { useChatActiveMonth } from "@/features/chat/ChatContext";

export function InsightsPageContent() {
  const [monthKey, setMonthKey] = useState(() => currentMonthKey());
  const [budgetsDialogOpen, setBudgetsDialogOpen] = useState(false);
  const insightsQuery = useInsights(monthKey);
  const budgetsQuery = useBudgets();
  useChatActiveMonth(monthKey);

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-extrabold tracking-tight">Insights</h1>
          <p className="text-sm text-slate-500">How this month compares, and where you stand on your budgets</p>
        </div>
        <div className="flex items-center gap-3">
          <MonthSwitcher monthKey={monthKey} onChange={setMonthKey} />
          <Button variant="secondary" onClick={() => setBudgetsDialogOpen(true)}>
            <Settings size={18} aria-hidden="true" />
            Edit budgets
          </Button>
        </div>
      </div>

      {insightsQuery.isLoading && <p className="text-sm text-slate-500">Loading insights…</p>}
      {insightsQuery.isError && <p className="text-sm text-danger">Could not load insights. Try again.</p>}

      {insightsQuery.data && (
        <>
          <SummaryCards
            summary={insightsQuery.data.summary}
            overallBudget={insightsQuery.data.budgets.find((b) => b.category_id === null)}
            monthKey={monthKey}
            onEditBudgets={() => setBudgetsDialogOpen(true)}
          />

          <NarrationSection monthKey={monthKey} insights={insightsQuery.data} />

          <div className="grid grid-cols-[1.35fr_1fr] items-start gap-4">
            <ChangesTable
              changes={insightsQuery.data.changes}
              thisMonthLabel={shortMonthKeyLabel(monthKey)}
              prevMonthLabel={shortMonthKeyLabel(shiftMonthKey(monthKey, -1))}
            />
            <CategoryBudgetsList
              budgets={insightsQuery.data.budgets.filter((b) => b.category_id !== null)}
              categoriesWithoutBudget={(budgetsQuery.data?.categories ?? [])
                .filter((row) => !insightsQuery.data?.budgets.some((b) => b.category_id === row.category_id))
                .map((row) => row.name)}
              onEdit={() => setBudgetsDialogOpen(true)}
            />
          </div>
        </>
      )}

      <BudgetsDialog open={budgetsDialogOpen} onClose={() => setBudgetsDialogOpen(false)} />
    </>
  );
}
