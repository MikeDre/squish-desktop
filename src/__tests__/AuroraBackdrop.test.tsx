import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuroraBackdrop } from "../components/AuroraBackdrop";

describe("AuroraBackdrop", () => {
  it("renders as a decorative backdrop", () => {
    render(<AuroraBackdrop active={false} />);

    expect(screen.getByRole("presentation", { hidden: true })).toHaveClass("aurora-backdrop");
  });

  it("applies the active heat class", () => {
    render(<AuroraBackdrop active />);

    expect(screen.getByRole("presentation", { hidden: true })).toHaveClass("aurora-backdrop--active");
  });
});
