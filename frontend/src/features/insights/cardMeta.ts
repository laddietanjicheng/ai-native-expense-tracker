import {
  AlertTriangle,
  ArrowRightLeft,
  ClipboardList,
  Clock,
  Droplets,
  Gauge,
  Lightbulb,
  Repeat,
  Target,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { CardType } from "./types";

export interface CardTypeMeta {
  label: string;
  icon: LucideIcon;
  chipBg: string;
  chipFg: string;
}

export const CARD_TYPE_META: Record<CardType, CardTypeMeta> = {
  pace: { label: "Pace", icon: Gauge, chipBg: "bg-blue-100", chipFg: "text-blue-800" },
  change: { label: "Change", icon: ArrowRightLeft, chipBg: "bg-slate-100", chipFg: "text-slate-700" },
  leak: { label: "Leak", icon: Droplets, chipBg: "bg-orange-100", chipFg: "text-orange-800" },
  recurring: { label: "Recurring", icon: Repeat, chipBg: "bg-violet-100", chipFg: "text-violet-900" },
  timing: { label: "Timing", icon: Clock, chipBg: "bg-violet-100", chipFg: "text-violet-900" },
  trend: { label: "Trend", icon: TrendingUp, chipBg: "bg-blue-100", chipFg: "text-blue-800" },
  budget: { label: "Budget", icon: Target, chipBg: "bg-amber-100", chipFg: "text-amber-900" },
  anomaly: { label: "Anomaly", icon: AlertTriangle, chipBg: "bg-orange-100", chipFg: "text-orange-800" },
  win: { label: "Win", icon: Trophy, chipBg: "bg-emerald-100", chipFg: "text-emerald-800" },
  logging: { label: "Logging", icon: ClipboardList, chipBg: "bg-slate-100", chipFg: "text-slate-700" },
  tip: { label: "Tip", icon: Lightbulb, chipBg: "bg-blue-100", chipFg: "text-blue-800" },
};
