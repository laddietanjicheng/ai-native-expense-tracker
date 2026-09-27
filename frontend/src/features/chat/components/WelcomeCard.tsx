import { EXAMPLE_QUESTIONS } from "../types";

interface WelcomeCardProps {
  onPick: (question: string) => void;
}

export function WelcomeCard({ onPick }: WelcomeCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4">
      <h3 className="m-0 text-[15px] font-extrabold">Ask anything about your spending</h3>
      <p className="m-0 text-[13px] leading-relaxed text-slate-600">
        I can compare months, explain changes, check your budgets, and plan a budget from your target and priorities.
      </p>
      <div className="flex flex-wrap gap-2">
        {EXAMPLE_QUESTIONS.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onPick(question)}
            className="rounded-full border border-slate-300 bg-white px-3 py-2 text-left text-[13px] font-semibold text-slate-700 hover:border-primary hover:text-primary-700"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
