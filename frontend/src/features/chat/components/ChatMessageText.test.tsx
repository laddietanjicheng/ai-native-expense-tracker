import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatMessageText } from "./ChatMessageText";

describe("ChatMessageText", () => {
  it("renders paragraphs separated by blank lines", () => {
    render(<ChatMessageText text={"First paragraph.\n\nSecond paragraph."} />);
    expect(screen.getByText("First paragraph.")).toBeInTheDocument();
    expect(screen.getByText("Second paragraph.")).toBeInTheDocument();
  });

  it("renders a '- ' prefixed block as a bullet list", () => {
    render(<ChatMessageText text={"- Dining Out is high\n- Entertainment is over budget"} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Dining Out is high");
  });

  it("renders **bold** spans as <b> without leaving asterisks", () => {
    render(<ChatMessageText text={"Bringing both back saves about **S$100.00**."} />);
    const bold = screen.getByText("S$100.00");
    expect(bold.tagName).toBe("B");
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it("never injects raw HTML", () => {
    const { container } = render(<ChatMessageText text={"<script>alert(1)</script>"} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });
});
