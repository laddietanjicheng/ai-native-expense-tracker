"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { centsToDisplay } from "@/lib/money";
import type { CategoryChange } from "../types";

interface ChangesTableProps {
  changes: CategoryChange[];
  thisMonthLabel: string;
  prevMonthLabel: string;
}

function DeltaCell({ deltaCents }: { deltaCents: number }) {
  if (deltaCents === 0) {
    return <td className="border-b border-slate-100 px-3 py-0 text-right font-bold text-slate-500">No change</td>;
  }
  const isUp = deltaCents > 0;
  return (
    <td className={`border-b border-slate-100 px-3 py-0 text-right font-bold tabular-nums ${isUp ? "text-orange-700" : "text-blue-700"}`}>
      {isUp ? "↑" : "↓"} {centsToDisplay(Math.abs(deltaCents))}
    </td>
  );
}

export function ChangesTable({ changes, thisMonthLabel, prevMonthLabel }: ChangesTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(categoryId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  return (
    <section aria-labelledby="changes-title" className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-baseline gap-2.5 px-6 pb-3 pt-4">
        <h2 id="changes-title" className="text-[17px] font-extrabold">
          What changed
        </h2>
        <span className="text-sm text-slate-500">vs {prevMonthLabel}</span>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50">
            <th scope="col" className="h-10 border-y border-slate-200 px-6 text-left text-[13px] font-bold text-slate-600">
              Category
            </th>
            <th scope="col" className="border-y border-slate-200 px-3 text-right text-[13px] font-bold text-slate-600">
              {thisMonthLabel}
            </th>
            <th scope="col" className="border-y border-slate-200 px-3 text-right text-[13px] font-bold text-slate-600">
              {prevMonthLabel}
            </th>
            <th scope="col" className="border-y border-slate-200 px-6 pl-3 text-right text-[13px] font-bold text-slate-600">
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          {changes.length === 0 && (
            <tr>
              <td colSpan={4} className="px-6 py-6 text-center text-slate-500">
                No spending recorded this month.
              </td>
            </tr>
          )}
          {changes.map((change) => {
            const hasSubs = change.sub_categories.length > 0;
            const isExpanded = expanded.has(change.category_id);
            return (
              <Fragment key={change.category_id}>
                <tr>
                  <th scope="row" className="h-12 border-b border-slate-100 px-6 text-left font-bold">
                    {hasSubs ? (
                      <button
                        type="button"
                        onClick={() => toggle(change.category_id)}
                        aria-expanded={isExpanded}
                        className="inline-flex items-center gap-2"
                      >
                        {isExpanded ? (
                          <ChevronDown size={14} aria-hidden="true" className="text-slate-500" />
                        ) : (
                          <ChevronRight size={14} aria-hidden="true" className="text-slate-500" />
                        )}
                        {change.name}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-2 pl-[22px]">{change.name}</span>
                    )}
                  </th>
                  <td className="border-b border-slate-100 px-3 text-right font-semibold tabular-nums">
                    {centsToDisplay(change.now_cents)}
                  </td>
                  <td className="border-b border-slate-100 px-3 text-right tabular-nums text-slate-500">
                    {centsToDisplay(change.prev_cents)}
                  </td>
                  <DeltaCell deltaCents={change.delta_cents} />
                </tr>
                {isExpanded &&
                  change.sub_categories.map((sub) => (
                    <tr key={sub.category_id} className="bg-slate-50/60">
                      <th scope="row" className="h-11 border-b border-slate-100 px-6 pl-[46px] text-left font-medium text-slate-700">
                        {sub.name}
                      </th>
                      <td className="border-b border-slate-100 px-3 text-right tabular-nums text-slate-700">
                        {centsToDisplay(sub.now_cents)}
                      </td>
                      <td className="border-b border-slate-100 px-3 text-right tabular-nums text-slate-500">
                        {centsToDisplay(sub.prev_cents)}
                      </td>
                      <DeltaCell deltaCents={sub.delta_cents} />
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
