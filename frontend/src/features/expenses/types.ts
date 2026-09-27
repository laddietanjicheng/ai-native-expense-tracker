export interface CategoryRef {
  id: string;
  name: string;
}

export interface Expense {
  id: string;
  amount_cents: number;
  expense_date: string;
  note: string | null;
  category: CategoryRef;
  sub_category: CategoryRef | null;
  created_at: string;
  updated_at: string;
}

export type SortField = "date" | "amount";
export type SortOrder = "asc" | "desc";

export interface ExpenseListMeta {
  page: number;
  page_size: number;
  total_count: number;
  total_amount_cents: number;
  category_count: number;
}

export interface ExpenseListParams {
  date_from?: string;
  date_to?: string;
  category_id?: string[];
  sub_category_id?: string;
  sort?: SortField;
  order?: SortOrder;
  page?: number;
  page_size?: number;
}

export interface ExpenseInput {
  amount_cents: number;
  expense_date: string;
  category_id: string;
  sub_category_id?: string | null;
  note?: string | null;
}
