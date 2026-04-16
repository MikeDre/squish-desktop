import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileRow } from "../components/FileRow";
import type { FileEntry } from "../types";

const pending: FileEntry = {
  id: "1",
  filename: "photo.png",
  path: "/tmp/photo.png",
  status: "pending",
};

const compressing: FileEntry = {
  ...pending,
  status: "compressing",
};

const done: FileEntry = {
  ...pending,
  status: "done",
  inputBytes: 100_000,
  outputBytes: 30_000,
  reductionPercent: 70.0,
  durationMs: 1200,
};

const error: FileEntry = {
  ...pending,
  status: "error",
  error: "decode failed",
};

describe("FileRow", () => {
  it("shows filename in all states", () => {
    render(<FileRow file={pending} />);
    expect(screen.getByText("photo.png")).toBeInTheDocument();
  });

  it("shows progress indicator when compressing", () => {
    render(<FileRow file={compressing} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows sizes and savings when done", () => {
    render(<FileRow file={done} />);
    expect(screen.getByText(/97\.7 KB/)).toBeInTheDocument();
    expect(screen.getByText(/29\.3 KB/)).toBeInTheDocument();
    expect(screen.getByText(/70\.0%/)).toBeInTheDocument();
  });

  it("shows error message when failed", () => {
    render(<FileRow file={error} />);
    expect(screen.getByText(/decode failed/)).toBeInTheDocument();
  });
});
