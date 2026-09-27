"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { insightsKeys } from "@/lib/queryKeys";
import { generateNarration, getInsights } from "./api";

export { insightsKeys };

export function useInsights(month: string) {
  return useQuery({
    queryKey: insightsKeys.month(month),
    queryFn: () => getInsights(month),
  });
}

export function useGenerateNarration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (month: string) => generateNarration(month),
    onSuccess: (data, month) => {
      queryClient.setQueryData(insightsKeys.month(month), data);
    },
  });
}
