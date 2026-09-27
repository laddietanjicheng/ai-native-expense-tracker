import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryCards } from "./SummaryCards";

describe("SummaryCards", () => {
  it("formats the total, count and daily average", () => {
    render(
      <SummaryCards
        totalAmountCents={128460}
        totalCount={24}
        categoryCount={6}
        dateRangeLabel="1 – 30 Sep 2026"
        dayCount={30}
      />
    );

    expect(screen.getByText("S$1,284.60")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("Across 6 categories")).toBeInTheDocument();
    expect(screen.getByText("S$42.82")).toBeInTheDocument();
    expect(screen.getByText("Over 30 days")).toBeInTheDocument();
  });

  it("shows a zero daily average and singular wording when there are no expenses", () => {
    render(
      <SummaryCards totalAmountCents={0} totalCount={0} categoryCount={0} dateRangeLabel="Today" dayCount={1} />
    );

    expect(screen.getByText("Over 1 day")).toBeInTheDocument();
    expect(screen.getByText("Across 0 categories")).toBeInTheDocument();
    expect(screen.getByText("S$0.00")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a dash and 'Pick a date range' for an unbounded (all time) range", () => {
    render(
      <SummaryCards totalAmountCents={128460} totalCount={24} categoryCount={6} dateRangeLabel="All time" dayCount={null} />
    );

    expect(screen.getByText("All time")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Pick a date range")).toBeInTheDocument();
  });
});
