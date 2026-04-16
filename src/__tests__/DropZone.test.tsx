import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DropZone } from "../components/DropZone";

describe("DropZone", () => {
  it("renders drop prompt when idle", () => {
    render(<DropZone status="idle" onDrop={vi.fn()} />);
    expect(screen.getByText(/drop images here/i)).toBeInTheDocument();
  });

  it("shows processing state when processing", () => {
    render(<DropZone status="processing" onDrop={vi.fn()} />);
    expect(screen.getByText(/compressing/i)).toBeInTheDocument();
  });

  it("shows ready for more when done", () => {
    render(<DropZone status="done" onDrop={vi.fn()} />);
    expect(screen.getByText(/drop more/i)).toBeInTheDocument();
  });
});
