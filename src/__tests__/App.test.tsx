import { describe, it, expect } from "vitest";
import { appReducer, initialState, loadSettings } from "../App";
import type { AppState, FileDonePayload } from "../types";

describe("appReducer", () => {
  it("START_BATCH transitions to processing and clears files", () => {
    const state = appReducer(initialState(), { type: "START_BATCH" });
    expect(state.status).toBe("processing");
    expect(state.files).toHaveLength(0);
  });

  it("START_BATCH clears previous files", () => {
    const prev: AppState = {
      ...initialState(),
      status: "done",
      files: [
        { id: "old", filename: "old.png", path: "/old.png", status: "done" },
      ],
    };
    const state = appReducer(prev, { type: "START_BATCH" });
    expect(state.files).toHaveLength(0);
  });

  it("FILE_START adds a new file entry with compressing status", () => {
    const prev: AppState = {
      ...initialState(),
      status: "processing",
    };
    const state = appReducer(prev, {
      type: "FILE_START",
      payload: { id: "1", filename: "a.png", path: "/a.png" },
    });
    expect(state.files).toHaveLength(1);
    expect(state.files[0].status).toBe("compressing");
    expect(state.files[0].filename).toBe("a.png");
  });

  it("FILE_DONE updates file with result data", () => {
    const prev: AppState = {
      ...initialState(),
      status: "processing",
      files: [{ id: "1", filename: "a.png", path: "/a.png", status: "compressing" }],
    };
    const payload: FileDonePayload = {
      id: "1",
      input_bytes: 100_000,
      output_bytes: 30_000,
      output_path: "/a_squished.png",
      reduction_percent: 70.0,
      duration_ms: 500,
    };
    const state = appReducer(prev, { type: "FILE_DONE", payload });
    expect(state.files[0].status).toBe("done");
    expect(state.files[0].inputBytes).toBe(100_000);
    expect(state.files[0].reductionPercent).toBe(70.0);
  });

  it("FILE_ERROR marks file as errored", () => {
    const prev: AppState = {
      ...initialState(),
      status: "processing",
      files: [
        { id: "1", filename: "a.png", path: "/a.png", status: "compressing" },
      ],
    };
    const state = appReducer(prev, {
      type: "FILE_ERROR",
      id: "1",
      error: "decode failed",
    });
    expect(state.files[0].status).toBe("error");
    expect(state.files[0].error).toBe("decode failed");
  });

  it("BATCH_COMPLETE transitions to done", () => {
    const prev: AppState = {
      ...initialState(),
      status: "processing",
      files: [
        { id: "1", filename: "a.png", path: "/a.png", status: "done" },
      ],
    };
    const state = appReducer(prev, { type: "BATCH_COMPLETE" });
    expect(state.status).toBe("done");
  });

  it("START_BATCH increments activeBatches", () => {
    const state = appReducer(initialState(), { type: "START_BATCH" });
    expect(state.activeBatches).toBe(1);
  });

  it("START_BATCH during processing appends without clearing files", () => {
    const prev: AppState = {
      ...initialState(),
      status: "processing",
      activeBatches: 1,
      files: [
        { id: "1", filename: "a.png", path: "/a.png", status: "done" },
      ],
    };
    const state = appReducer(prev, { type: "START_BATCH" });
    expect(state.activeBatches).toBe(2);
    expect(state.files).toHaveLength(1);
    expect(state.status).toBe("processing");
  });

  it("START_BATCH when idle/done clears files", () => {
    const prev: AppState = {
      ...initialState(),
      status: "done",
      activeBatches: 0,
      files: [
        { id: "1", filename: "a.png", path: "/a.png", status: "done" },
      ],
    };
    const state = appReducer(prev, { type: "START_BATCH" });
    expect(state.files).toHaveLength(0);
    expect(state.activeBatches).toBe(1);
  });

  it("BATCH_COMPLETE decrements activeBatches", () => {
    const prev: AppState = {
      ...initialState(),
      status: "processing",
      activeBatches: 2,
    };
    const state = appReducer(prev, { type: "BATCH_COMPLETE" });
    expect(state.activeBatches).toBe(1);
    expect(state.status).toBe("processing");
  });

  it("BATCH_COMPLETE transitions to done when activeBatches reaches 0", () => {
    const prev: AppState = {
      ...initialState(),
      status: "processing",
      activeBatches: 1,
    };
    const state = appReducer(prev, { type: "BATCH_COMPLETE" });
    expect(state.activeBatches).toBe(0);
    expect(state.status).toBe("done");
  });

  it("UPDATE_SETTINGS merges partial settings", () => {
    const state = appReducer(initialState(), {
      type: "UPDATE_SETTINGS",
      settings: { lossless: true },
    });
    expect(state.settings.lossless).toBe(true);
    expect(state.settings.quality).toBeNull(); // unchanged
  });

  it("UPDATE_SETTINGS merges maxWidth, maxHeight, and suffix", () => {
    const state = appReducer(initialState(), {
      type: "UPDATE_SETTINGS",
      settings: { maxWidth: 1920, maxHeight: 1080, suffix: "min" },
    });
    expect(state.settings.maxWidth).toBe(1920);
    expect(state.settings.maxHeight).toBe(1080);
    expect(state.settings.suffix).toBe("min");
    expect(state.settings.quality).toBeNull(); // unchanged
  });
});

describe("loadSettings", () => {
  it("returns defaults when localStorage is empty", () => {
    localStorage.clear();
    const s = loadSettings();
    expect(s.quality).toBeNull();
    expect(s.lossless).toBe(false);
    expect(s.format).toBeNull();
    expect(s.recursive).toBe(false);
  });

  it("merges saved settings with defaults for missing keys", () => {
    localStorage.setItem(
      "squish-settings",
      JSON.stringify({ quality: 80, lossless: true })
    );
    const s = loadSettings();
    expect(s.quality).toBe(80);
    expect(s.lossless).toBe(true);
    expect(s.format).toBeNull();
    expect(s.recursive).toBe(false);
  });

  it("returns null defaults for maxWidth, maxHeight, and suffix when localStorage is empty", () => {
    localStorage.clear();
    const s = loadSettings();
    expect(s.maxWidth).toBeNull();
    expect(s.maxHeight).toBeNull();
    expect(s.suffix).toBeNull();
  });

  it("preserves saved maxWidth, maxHeight, and suffix from localStorage", () => {
    localStorage.setItem(
      "squish-settings",
      JSON.stringify({ maxWidth: 2560, maxHeight: 1440, suffix: "compressed" })
    );
    const s = loadSettings();
    expect(s.maxWidth).toBe(2560);
    expect(s.maxHeight).toBe(1440);
    expect(s.suffix).toBe("compressed");
  });

  it("preserves maxWidth and maxHeight of 0 (does not coerce to null via || )", () => {
    localStorage.setItem(
      "squish-settings",
      JSON.stringify({ maxWidth: 0, maxHeight: 0 })
    );
    const s = loadSettings();
    expect(s.maxWidth).toBe(0);
    expect(s.maxHeight).toBe(0);
  });
});
