import { describe, it, expect } from "vitest";
import { formatBytes, formatSummary } from "../lib/notify";
import type { BatchResult } from "../types";

function result(over: Partial<BatchResult>): BatchResult {
  const fam = { total: 0, success: 0, error: 0, skipped: 0 };
  return {
    total_files: 0,
    success_count: 0,
    error_count: 0,
    skipped_count: 0,
    total_input_bytes: 0,
    total_output_bytes: 0,
    total_duration_ms: 0,
    by_family: { image: fam, audio: fam, video: fam, code: fam },
    ...over,
  };
}

describe("formatBytes", () => {
  it("uses decimal units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1_500)).toBe("1.5 KB");
    expect(formatBytes(2_100_000)).toBe("2.1 MB");
    expect(formatBytes(1_000)).toBe("1 KB");
    expect(formatBytes(2_000_000)).toBe("2 MB");
  });
});

describe("formatSummary", () => {
  it("reports files squished and bytes saved", () => {
    const s = formatSummary(
      result({ success_count: 4, total_input_bytes: 5_000_000, total_output_bytes: 2_900_000 }),
    );
    expect(s).toBe("Squished 4 files · saved 2.1 MB");
  });

  it("appends failures and skips when present", () => {
    const s = formatSummary(
      result({
        success_count: 3,
        error_count: 1,
        skipped_count: 2,
        total_input_bytes: 1_000_000,
        total_output_bytes: 800_000,
      }),
    );
    expect(s).toBe("Squished 3 files · saved 200 KB · 1 failed · 2 skipped");
  });

  it("handles a nothing-squished batch", () => {
    const s = formatSummary(result({ skipped_count: 1 }));
    expect(s).toBe("Squished 0 files · 1 skipped");
  });
});
