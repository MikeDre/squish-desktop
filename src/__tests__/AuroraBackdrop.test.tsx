import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuroraBackdrop } from "../components/AuroraBackdrop";

describe("AuroraBackdrop", () => {
  it("renders as a decorative backdrop with three glow layers", () => {
    const { container } = render(<AuroraBackdrop active={false} />);

    expect(screen.getByRole("presentation", { hidden: true })).toHaveClass("aurora-backdrop");
    expect(container.querySelectorAll(".aurora-backdrop__glow")).toHaveLength(3);
  });

  it("is hidden from the accessibility tree", () => {
    render(<AuroraBackdrop active={false} />);

    expect(screen.getByRole("presentation", { hidden: true })).toHaveAttribute("aria-hidden", "true");
  });

  it("applies the active heat class only when active", () => {
    const { rerender } = render(<AuroraBackdrop active={false} />);

    expect(screen.getByRole("presentation", { hidden: true })).not.toHaveClass("aurora-backdrop--active");

    rerender(<AuroraBackdrop active />);

    expect(screen.getByRole("presentation", { hidden: true })).toHaveClass("aurora-backdrop--active");
  });
});
