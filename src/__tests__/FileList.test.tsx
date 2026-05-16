import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileList } from "../components/FileList";
import type { FileEntry, BatchResult } from "../types";

const files: FileEntry[] = [
  {
    id: "1",
    filename: "a.png",
    path: "/a.png",
    status: "done",
    inputBytes: 100_000,
    outputBytes: 30_000,
    reductionPercent: 70.0,
    durationMs: 500,
  },
  {
    id: "2",
    filename: "b.jpg",
    path: "/b.jpg",
    status: "done",
    inputBytes: 50_000,
    outputBytes: 40_000,
    reductionPercent: 20.0,
    durationMs: 300,
  },
];

const batchResult: BatchResult = {
  total_files: 2,
  success_count: 2,
  error_count: 0,
  skipped_count: 0,
  total_input_bytes: 150_000,
  total_output_bytes: 70_000,
  total_duration_ms: 800,
  by_family: {
    image: { total: 2, success: 2, error: 0, skipped: 0 },
    audio: { total: 0, success: 0, error: 0, skipped: 0 },
    video: { total: 0, success: 0, error: 0, skipped: 0 },
    code: { total: 0, success: 0, error: 0, skipped: 0 },
  },
};

describe("FileList", () => {
  it("renders a row for each file", () => {
    render(<FileList files={files} batchResult={null} />);
    expect(screen.getByText("a.png")).toBeInTheDocument();
    expect(screen.getByText("b.jpg")).toBeInTheDocument();
  });

  it("shows summary when batch result is provided", () => {
    render(<FileList files={files} batchResult={batchResult} />);
    expect(screen.getByText(/2 files/)).toBeInTheDocument();
  });

  it("renders empty when no files", () => {
    const { container } = render(<FileList files={[]} batchResult={null} />);
    expect(container.querySelector(".file-list")).toBeNull();
  });
});
