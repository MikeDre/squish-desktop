import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSquish } from "../hooks/useSquish";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Settings, BatchResult, AppAction } from "../types";

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);

describe("useSquish", () => {
  let dispatch: React.Dispatch<AppAction>;
  let settings: Settings;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatch = vi.fn() as unknown as React.Dispatch<AppAction>;
    settings = { quality: null, lossless: false, format: null, recursive: false, maxWidth: null, maxHeight: null, suffix: null };

    // Default: listen returns an unlisten function.
    mockListen.mockResolvedValue(() => {});
  });

  it("sets up event listeners on mount", async () => {
    renderHook(() => useSquish(dispatch, settings));
    // Flush the async setup() that awaits each listen() call sequentially.
    await vi.waitFor(() => {
      expect(mockListen).toHaveBeenCalledTimes(3);
    });
    expect(mockListen).toHaveBeenCalledWith("squish://file-start", expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith("squish://file-done", expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith("squish://file-error", expect.any(Function));
  });

  it("squishFiles invokes Tauri command with correct args", async () => {
    const batchResult: BatchResult = {
      total_files: 1,
      success_count: 1,
      error_count: 0,
      skipped_count: 0,
      total_input_bytes: 100,
      total_output_bytes: 50,
      total_duration_ms: 200,
    };
    mockInvoke.mockResolvedValue(batchResult);

    const { result } = renderHook(() => useSquish(dispatch, settings));

    await act(async () => {
      await result.current.squishFiles(["/tmp/a.png"]);
    });

    expect(mockInvoke).toHaveBeenCalledWith("squish_files", {
      paths: ["/tmp/a.png"],
      options: { quality: null, lossless: false, format: null, recursive: false },
    });
  });
});
