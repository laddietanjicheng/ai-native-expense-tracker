import { Suspense } from "react";
import { ExpensesPageContent } from "@/features/expenses/components/ExpensesPageContent";

export default function ExpensesPage() {
  return (
    <Suspense fallback={null}>
      <ExpensesPageContent />
    </Suspense>
  );
}
