export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  expense_count: number;
  sub_categories: Category[];
}

export interface CategoryInput {
  name: string;
  parent_id?: string;
}
