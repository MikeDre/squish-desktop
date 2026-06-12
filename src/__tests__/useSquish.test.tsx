import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSquish, buildPayload } from "../hooks/useSquish";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Settings, BatchResult, AppAction } from "../types";
import { DEFAULT_SETTINGS } from "../types";

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);

const DEFAULT_BATCH_RESULT: BatchResult = {
  total_files: 0,
  success_count: 0,
  error_count: 0,
  skipped_count: 0,
  total_input_bytes: 0,
  total_output_bytes: 0,
  total_duration_ms: 0,
  by_family: {
    image: { total: 0, success: 0, error: 0, skipped: 0 },
    audio: { total: 0, success: 0, error: 0, skipped: 0 },
    video: { total: 0, success: 0, error: 0, skipped: 0 },
    code: { total: 0, success: 0, error: 0, skipped: 0 },
  },
};

describe("useSquish", () => {
  let dispatch: React.Dispatch<AppAction>;
  let settings: Settings;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatch = vi.fn() as unknown as React.Dispatch<AppAction>;
    settings = DEFAULT_SETTINGS;

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

  it("squishFiles invokes Tauri command with correct nested options", async () => {
    const batchResult: BatchResult = {
      ...DEFAULT_BATCH_RESULT,
      total_files: 1,
      success_count: 1,
      total_input_bytes: 100,
      total_output_bytes: 50,
      total_duration_ms: 200,
    };
    mockInvoke.mockResolvedValue(batchResult);

    const filledSettings: Settings = {
      recursive: true,
      targetSizeBytes: null,
      image: { quality: 80, lossless: false, format: "webp", maxWidth: 1920, maxHeight: 1080, suffix: "min" },
      audio: { codec: "mp3", bitrateKbps: 192, format: null, suffix: null },
      video: { codec: null, quality: null, preset: null, format: null, suffix: null },
      code: { sourceMap: false, suffix: null },
    };

    const { result } = renderHook(() => useSquish(dispatch, filledSettings));

    await act(async () => {
      await result.current.squishFiles(["/tmp/a.png"]);
    });

    expect(mockInvoke).toHaveBeenCalledWith("squish_files", {
      paths: ["/tmp/a.png"],
      options: {
        recursive: true,
        force_overwrite: false,
        target_size: null,
        image: {
          quality: 80,
          lossless: false,
          format: "webp",
          max_width: 1920,
          max_height: 1080,
          suffix: "min",
        },
        audio: {
          codec: "mp3",
          bitrate_kbps: 192,
          format: null,
          suffix: null,
        },
        video: {
          codec: null,
          quality: null,
          preset: null,
          format: null,
          suffix: null,
        },
        code: {
          source_map: false,
          suffix: null,
        },
      },
    });
  });

  it("dispatches BATCH_COMPLETE after squishFiles resolves", async () => {
    mockInvoke.mockResolvedValue(DEFAULT_BATCH_RESULT);

    const { result } = renderHook(() => useSquish(dispatch, settings));

    await act(async () => {
      await result.current.squishFiles(["/tmp/a.png"]);
    });

    expect(dispatch).toHaveBeenCalledWith({ type: "BATCH_COMPLETE" });
  });

  it("dispatches BATCH_COMPLETE and returns null when invoke rejects", async () => {
    mockInvoke.mockRejectedValue(new Error("tauri error"));

    const { result } = renderHook(() => useSquish(dispatch, settings));

    let returnValue: BatchResult | null | undefined;
    await act(async () => {
      returnValue = await result.current.squishFiles(["/tmp/a.png"]);
    });

    expect(returnValue).toBeNull();
    expect(dispatch).toHaveBeenCalledWith({ type: "BATCH_COMPLETE" });
  });
});

describe("buildPayload", () => {
  it("maps camelCase TS settings to snake_case wire format", () => {
    const out = buildPayload({
      ...DEFAULT_SETTINGS,
      recursive: true,
      image: { ...DEFAULT_SETTINGS.image, maxWidth: 1920, maxHeight: 1080, suffix: "small" },
      audio: { ...DEFAULT_SETTINGS.audio, codec: "mp3", bitrateKbps: 192 },
      code: { ...DEFAULT_SETTINGS.code, sourceMap: true },
    });
    expect(out.recursive).toBe(true);
    expect(out.force_overwrite).toBe(false);
    expect(out.image.max_width).toBe(1920);
    expect(out.image.max_height).toBe(1080);
    expect(out.image.suffix).toBe("small");
    expect(out.audio.codec).toBe("mp3");
    expect(out.audio.bitrate_kbps).toBe(192);
    expect(out.code.source_map).toBe(true);
  });
});

describe("buildPayload target size and formats", () => {
  it("sends target_size and new format fields", () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      targetSizeBytes: 1_000_000,
      video: { ...DEFAULT_SETTINGS.video, quality: 80, format: "mkv" },
      audio: { ...DEFAULT_SETTINGS.audio, format: "mp3" },
    };
    const p = buildPayload(settings);
    expect(p.target_size).toBe(1_000_000);
    expect(p.video.quality).toBeNull(); // nulled: budget controls quality
    expect(p.video.format).toBe("mkv");
    expect(p.audio.format).toBe("mp3");
  });

  it("nulls conflicting fields when a budget is set", () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      targetSizeBytes: 500_000,
      image: { ...DEFAULT_SETTINGS.image, quality: 80, lossless: true },
      audio: { ...DEFAULT_SETTINGS.audio, bitrateKbps: 192, codec: "flac" },
      video: { ...DEFAULT_SETTINGS.video, quality: 90 },
    };
    const p = buildPayload(settings);
    expect(p.image.quality).toBeNull();
    expect(p.image.lossless).toBe(false);
    expect(p.audio.bitrate_kbps).toBeNull();
    expect(p.audio.codec).toBeNull(); // flac is lossless — incompatible with a budget
    expect(p.video.quality).toBeNull();
  });

  it("passes fields through unchanged when no budget is set", () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      image: { ...DEFAULT_SETTINGS.image, quality: 80, lossless: true },
      video: { ...DEFAULT_SETTINGS.video, quality: 90 },
    };
    const p = buildPayload(settings);
    expect(p.target_size).toBeNull();
    expect(p.image.quality).toBe(80);
    expect(p.image.lossless).toBe(true);
    expect(p.video.quality).toBe(90);
  });
});
