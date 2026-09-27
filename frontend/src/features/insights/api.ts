import { apiRequest } from "@/lib/apiClient";
import type { InsightsOut } from "./types";

export async function getInsights(month: string): Promise<InsightsOut> {
  const { data } = await apiRequest<InsightsOut>(`/insights?month=${month}`);
  return data;
}

export async function generateNarration(month: string): Promise<InsightsOut> {
  const { data } = await apiRequest<InsightsOut>(`/insights/narration?month=${month}`, {
    method: "POST",
  });
  return data;
}
