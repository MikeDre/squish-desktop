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

  it("shows reveal button when done", () => {
    const doneWithPath: FileEntry = {
      ...done,
      outputPath: "/tmp/photo_squished.png",
    };
    render(<FileRow file={doneWithPath} />);
    expect(screen.getByRole("button", { name: /show in finder/i })).toBeInTheDocument();
  });

  it("does not show reveal button when compressing", () => {
    render(<FileRow file={compressing} />);
    expect(screen.queryByRole("button", { name: /show in finder/i })).not.toBeInTheDocument();
  });

  it("does not show reveal button when error", () => {
    render(<FileRow file={error} />);
    expect(screen.queryByRole("button", { name: /show in finder/i })).not.toBeInTheDocument();
  });

  it("renders family badge for a done file", () => {
    render(<FileRow file={{
      id: '1', filename: 'a.mp3', path: '/a.mp3', family: 'audio',
      status: 'done', inputBytes: 100, outputBytes: 50,
      reductionPercent: 50, outputPath: '/a-squished.mp3', durationMs: 100,
      warnings: [],
    }} />);
    expect(screen.getByTitle('Audio')).toBeInTheDocument();
  });

  it("shows warnings chip when warnings present", () => {
    render(<FileRow file={{
      id: '1', filename: 'a.webp', path: '/a.webp', family: 'image',
      status: 'done', inputBytes: 100, outputBytes: 100,
      reductionPercent: 0, outputPath: '/a-squished.webp', durationMs: 10,
      warnings: ['animated WebP passed through'],
    }} />);
    expect(screen.getByLabelText(/1 warning/)).toBeInTheDocument();
  });

  it("shows Install ffmpeg action for missing_dependency error", () => {
    render(<FileRow file={{
      id: '1', filename: 'a.mp3', path: '/a.mp3', family: 'audio',
      status: 'error', error: 'missing dependency: ffmpeg',
      errorKind: 'missing_dependency',
    }} />);
    expect(screen.getByRole('button', { name: /Install ffmpeg/i })).toBeInTheDocument();
  });
});
