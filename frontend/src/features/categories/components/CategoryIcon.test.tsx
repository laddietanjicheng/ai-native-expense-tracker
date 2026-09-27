import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CategoryIcon } from "./CategoryIcon";

describe("CategoryIcon", () => {
  it("renders a known category's icon", () => {
    const { container } = render(<CategoryIcon name="Food" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("falls back to the default icon for an unknown category", () => {
    const { container } = render(<CategoryIcon name="Something Else" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
