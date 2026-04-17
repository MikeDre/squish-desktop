import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DropZone } from "../components/DropZone";

describe("DropZone", () => {
  it("renders drop prompt when idle", () => {
    render(<DropZone status="idle" onDrop={vi.fn()} />);
    expect(screen.getByText(/drop files here/i)).toBeInTheDocument();
  });

  it("shows drop-more text when processing", () => {
    render(<DropZone status="processing" onDrop={vi.fn()} />);
    expect(screen.getByText(/drop more files/i)).toBeInTheDocument();
  });

  it("shows drop prompt when done", () => {
    render(<DropZone status="done" onDrop={vi.fn()} />);
    expect(screen.getByText(/drop files here/i)).toBeInTheDocument();
  });

  it("renders a browse button", () => {
    render(<DropZone status="idle" onDrop={vi.fn()} />);
    expect(screen.getByRole("button", { name: /browse/i })).toBeInTheDocument();
  });

  it("calls open dialog when browse is clicked", async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const mockOpen = vi.mocked(open);
    mockOpen.mockResolvedValueOnce([
      { path: "/tmp/a.png", name: "a.png" },
    ] as any);

    const user = userEvent.setup();
    const onDrop = vi.fn();
    render(<DropZone status="idle" onDrop={onDrop} />);

    await user.click(screen.getByRole("button", { name: /browse/i }));
    expect(mockOpen).toHaveBeenCalledWith({
      multiple: true,
      directory: false,
    });
  });
});
