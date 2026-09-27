import { z } from "zod";
import { parseAmountToCents } from "@/lib/money";

export const expenseFormSchema = z.object({
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((value) => parseAmountToCents(value) !== null, {
      message: "Enter an amount greater than 0.00 with up to 2 decimal places",
    }),
  expense_date: z.string().min(1, "Date is required"),
  category_id: z.string().min(1, "Category is required"),
  sub_category_id: z.string().optional(),
  note: z.string().max(500, "Note must be 500 characters or fewer").optional(),
});

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;
