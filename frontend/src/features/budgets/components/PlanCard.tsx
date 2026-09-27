"use client";

import { useState } from "react";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { centsToDisplay } from "@/lib/money";
import { ApiError } from "@/lib/apiClient";
import { usePatchBudgets } from "../hooks";
import type { BudgetPatch, PreviousBudgets } from "../types";
import type { Proposal } from "@/features/insights/types";

interface PlanCardProps {
  proposal: Proposal;
}

type PlanCardState = "idle" | "applied" | "dismissed" | "undone";

function proposalTouchesOverall(proposal: Proposal): boolean {
  return proposal.rows.some((row) => row.category_id === null);
}

function patchFromProposal(proposal: Proposal): BudgetPatch {
  const overallRow = proposal.rows.find((row) => row.category_id === null);
  return {
    ...(overallRow ? { overall_cents: overallRow.to_cents } : {}),
    categories: proposal.rows
      .filter((row) => row.category_id !== null)
      .map((row) => ({ category_id: row.category_id as string, amount_cents: row.to_cents })),
  };
}

/**
 * The server always echoes `previous.overall_cents` (null when it wasn't touched), so
 * whether to send it back on Undo must come from what the original Apply changed, not
 * from whether the field is present on `previous`.
 */
function patchFromPrevious(previous: PreviousBudgets, includeOverall: boolean): BudgetPatch {
  return {
    ...(includeOverall ? { overall_cents: previous.overall_cents } : {}),
    categories: previous.categories,
  };
}

/** Reusable plan-card UI for a D7 budget suggestion or a chat proposal; matches docs/design/preview/ai-assistant.html `.proposal`. */
export function PlanCard({ proposal }: PlanCardProps) {
  const [state, setState] = useState<PlanCardState>("idle");
  const [previous, setPrevious] = useState<PreviousBudgets | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const patchMutation = usePatchBudgets();

  async function handleApply() {
    if (patchMutation.isPending) return;
    setErrorMessage(null);
    try {
      const result = await patchMutation.mutateAsync(patchFromProposal(proposal));
      setPrevious(result.previous);
      setState("applied");
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : "Could not apply this plan. Try again.");
    }
  }

  async function handleUndo() {
    if (!previous || patchMutation.isPending) return;
    setErrorMessage(null);
    try {
      await patchMutation.mutateAsync(patchFromPrevious(previous, proposalTouchesOverall(proposal)));
      setState("undone");
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : "Could not undo this change. Try again.");
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-extrabold">
        <Target size={16} aria-hidden="true" />
        {proposal.title}
      </div>
      <div>
        {proposal.rows.map((row) => (
          <div
            key={row.category_id ?? "overall"}
            className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 px-4 py-2.5 text-sm last:border-b-0"
          >
            <span className="flex-grow font-bold text-slate-900">{row.name}</span>
            {row.from_cents !== null && (
              <>
                <s className="tabular-nums text-slate-400">{centsToDisplay(row.from_cents)}</s>
                <span aria-hidden="true">→</span>
              </>
            )}
            <span className="font-extrabold tabular-nums text-slate-900">{centsToDisplay(row.to_cents)}</span>
            {row.reason && <span className="basis-full text-xs leading-snug text-slate-500">{row.reason}</span>}
          </div>
        ))}
      </div>

      {errorMessage && <p className="px-4 pt-2 text-sm text-danger">{errorMessage}</p>}

      {state === "idle" && (
        <div className="flex items-center gap-2 px-4 py-2.5">
          <span className="flex-grow text-[13px] text-slate-500">{proposal.footer}</span>
          <Button variant="ghost" className="h-9 px-3 text-sm" onClick={() => setState("dismissed")}>
            Dismiss
          </Button>
          <Button className="h-9 px-3 text-sm" onClick={handleApply} disabled={patchMutation.isPending}>
            Apply
          </Button>
        </div>
      )}
      {state === "applied" && (
        <div className="flex items-center gap-2 bg-primary-50 px-4 py-2.5 text-[13px] font-bold text-primary-700">
          <span className="flex-grow">Budgets updated</span>
          <button type="button" onClick={handleUndo} disabled={patchMutation.isPending} className="font-bold underline">
            Undo
          </button>
        </div>
      )}
      {state === "dismissed" && (
        <div className="px-4 py-2.5 text-[13px] text-slate-500">Dismissed. No changes made.</div>
      )}
      {state === "undone" && (
        <div className="px-4 py-2.5 text-[13px] text-slate-500">Undone. Your budgets are back as they were.</div>
      )}
    </div>
  );
}
