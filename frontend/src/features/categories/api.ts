import { apiRequest } from "@/lib/apiClient";
import type { Category, CategoryInput } from "./types";

export interface CategoryDateRange {
  date_from: string | null;
  date_to: string | null;
}

export async function listCategories(range?: CategoryDateRange): Promise<Category[]> {
  const params = new URLSearchParams();
  if (range?.date_from) params.set("date_from", range.date_from);
  if (range?.date_to) params.set("date_to", range.date_to);
  const query = params.toString();
  const { data } = await apiRequest<Category[]>(`/categories${query ? `?${query}` : ""}`);
  return data;
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  const { data } = await apiRequest<Category>("/categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data;
}

export async function renameCategory(id: string, name: string): Promise<Category> {
  const { data } = await apiRequest<Category>(`/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  await apiRequest<null>(`/categories/${id}`, { method: "DELETE" });
}
