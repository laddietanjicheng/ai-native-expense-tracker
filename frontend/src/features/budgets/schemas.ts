import { z } from "zod";
import { parseAmountToCents } from "@/lib/money";

/** Blank means "no budget"; otherwise the same rules as an expense amount. */
const optionalAmountField = z
  .string()
  .refine((value) => value.trim() === "" || parseAmountToCents(value) !== null, {
    message: "Enter an amount greater than 0.00 with up to 2 decimal places",
  });

export const budgetsFormSchema = z.object({
  overall: optionalAmountField,
  categories: z.record(z.string(), optionalAmountField),
});

export type BudgetsFormValues = z.infer<typeof budgetsFormSchema>;
