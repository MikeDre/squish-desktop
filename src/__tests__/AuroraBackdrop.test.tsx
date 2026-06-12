import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AuroraBackdrop } from "../components/AuroraBackdrop";

describe("AuroraBackdrop", () => {
  it("renders the backdrop with three glow layers", () => {
    const { container } = render(<AuroraBackdrop active={false} />);
    expect(container.querySelector(".aurora")).toBeInTheDocument();
    expect(container.querySelectorAll(".aurora__glow")).toHaveLength(3);
  });

  it("is decorative: aria-hidden and not in the a11y tree", () => {
    const { container } = render(<AuroraBackdrop active={false} />);
    expect(container.querySelector(".aurora")).toHaveAttribute("aria-hidden", "true");
  });

  it("applies the active (heat-up) class only when active", () => {
    const { container, rerender } = render(<AuroraBackdrop active={false} />);
    expect(container.querySelector(".aurora")).not.toHaveClass("aurora--active");
    rerender(<AuroraBackdrop active={true} />);
    expect(container.querySelector(".aurora")).toHaveClass("aurora--active");
  });
});
