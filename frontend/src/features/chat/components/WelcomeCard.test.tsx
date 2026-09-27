import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WelcomeCard } from "./WelcomeCard";
import { EXAMPLE_QUESTIONS } from "../types";

describe("WelcomeCard", () => {
  it("renders all 4 example questions", () => {
    render(<WelcomeCard onPick={vi.fn()} />);
    for (const question of EXAMPLE_QUESTIONS) {
      expect(screen.getByRole("button", { name: question })).toBeInTheDocument();
    }
  });

  it("calls onPick with the question's text when clicked", async () => {
    const onPick = vi.fn();
    render(<WelcomeCard onPick={onPick} />);

    await userEvent.click(screen.getByRole("button", { name: EXAMPLE_QUESTIONS[0] }));

    expect(onPick).toHaveBeenCalledWith(EXAMPLE_QUESTIONS[0]);
  });
});
