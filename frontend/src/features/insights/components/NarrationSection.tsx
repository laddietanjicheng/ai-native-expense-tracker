"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/apiClient";
import { PlanCard } from "@/features/budgets/components/PlanCard";
import { useGenerateNarration } from "../hooks";
import { CARD_TYPE_META } from "../cardMeta";
import type { Card, InsightsOut } from "../types";

interface NarrationSectionProps {
  monthKey: string;
  insights: InsightsOut;
}

const HANDLED_ERROR_CODES = ["NOT_ENOUGH_DATA", "RATE_LIMITED"];

function formatGeneratedTime(iso: string): string {
  const formatter = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(new Date(iso));
}

export function NarrationSection({ monthKey, insights }: NarrationSectionProps) {
  const generateMutation = useGenerateNarration();
  const autoTriggered = useRef<Set<string>>(new Set());
  const narration = insights.narration;

  useEffect(() => {
    // Membership in the ref (not mutation.isPending) gates the trigger, so switching to a
    // different month while another month's generation is still in flight isn't blocked by
    // the single shared mutation's pending state.
    if (narration === null && !autoTriggered.current.has(monthKey)) {
      autoTriggered.current.add(monthKey);
      generateMutation.mutate(monthKey);
    }
    // Auto-generate fires once per month; Refresh triggers subsequent attempts explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, narration]);

  // The mutation object is shared across months, so its isPending/error only describe the
  // most recent call. Scope both to the month being viewed so a stale result for month A
  // never shows as loading or an error while viewing month B.
  const isForThisMonth = generateMutation.variables === monthKey;
  const error = isForThisMonth ? generateMutation.error : null;
  const errorCode = error instanceof ApiError ? error.code : error ? "UNKNOWN" : null;
  const isLoading = isForThisMonth && generateMutation.isPending;

  const captionBase = "Written by Claude from your totals only, never your notes";
  const caption = narration ? `${captionBase} · ${formatGeneratedTime(narration.created_at)}` : captionBase;

  return (
    <section aria-labelledby="ai-title" className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white px-6 pb-6 pt-5">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 id="ai-title" className="text-[17px] font-extrabold">
            What stood out
          </h2>
          <span className="text-sm text-slate-500">{caption}</span>
        </div>
        <button
          type="button"
          onClick={() => generateMutation.mutate(monthKey)}
          disabled={isLoading}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-bold disabled:opacity-50"
        >
          <RefreshCw size={16} aria-hidden="true" />
          {errorCode === "AI_UNAVAILABLE" ? "Try again" : "Refresh"}
        </button>
      </div>

      {insights.is_stale && narration && (
        <div role="status" className="flex items-center gap-2.5 rounded-lg bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-900">
          <AlertCircle size={18} aria-hidden="true" />
          Your expenses changed since this summary was written. Refresh to update it.
        </div>
      )}

      {isLoading && !narration && <NarrationSkeleton />}

      {!isLoading && errorCode === "NOT_ENOUGH_DATA" && (
        <EmptyNotice text="Not enough data yet. Add at least one expense in this month and in the previous month to get a written summary." />
      )}
      {!isLoading && errorCode === "RATE_LIMITED" && (
        <EmptyNotice text="Today's limit for AI summaries has been reached. Try again tomorrow." />
      )}
      {!isLoading && errorCode && !HANDLED_ERROR_CODES.includes(errorCode) && (
        <EmptyNotice text="The written summary isn't available right now. All the numbers on this page are still accurate." />
      )}

      {!isLoading && !errorCode && narration && narration.cards.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {narration.cards.map((card) => (
            <NarrationCard key={`${card.type}-${card.fact_ids.join(",")}`} card={card} />
          ))}
        </div>
      )}
    </section>
  );
}

function NarrationCard({ card }: { card: Card }) {
  const meta = CARD_TYPE_META[card.type];
  const Icon = meta.icon;
  return (
    <article className="flex flex-col gap-2 rounded-[10px] border border-slate-200 bg-white p-4">
      <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${meta.chipBg} ${meta.chipFg}`}>
        <Icon size={13} aria-hidden="true" />
        {meta.label}
      </span>
      <h3 className="text-base font-extrabold leading-snug">{card.title}</h3>
      <p className="text-sm leading-relaxed text-slate-700">{card.body}</p>
      {card.proposal && <PlanCard proposal={card.proposal} />}
    </article>
  );
}

function NarrationSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="flex animate-pulse flex-col gap-2 rounded-[10px] border border-slate-200 p-4">
          <div className="h-5 w-20 rounded-full bg-slate-200" />
          <div className="h-4 w-3/4 rounded bg-slate-200" />
          <div className="h-3 w-full rounded bg-slate-200" />
          <div className="h-3 w-2/3 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

function EmptyNotice({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-5 text-sm text-slate-700"
    >
      {text}
    </div>
  );
}
