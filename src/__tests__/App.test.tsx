import { describe, it, expect, beforeEach } from "vitest";
import { appReducer, initialState } from "../App";
import { migrateSettings } from "../lib/settings/migrate";
import { DEFAULT_SETTINGS } from "../types";
import type { AppState, FileDonePayload, FileStartPayload, FileErrorPayload } from "../types";

describe("appReducer", () => {
  beforeEach(() => {
    localStorage.clear();
  });

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
        { id: "old", filename: "old.png", path: "/old.png", family: "image", status: "done" },
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
    const payload: FileStartPayload = { id: "1", filename: "a.png", path: "/a.png", family: "image" };
    const state = appReducer(prev, { type: "FILE_START", payload });
    expect(state.files).toHaveLength(1);
    expect(state.files[0].status).toBe("compressing");
    expect(state.files[0].filename).toBe("a.png");
    expect(state.files[0].family).toBe("image");
  });

  it("FILE_DONE updates file with result data", () => {
    const prev: AppState = {
      ...initialState(),
      status: "processing",
      files: [{ id: "1", filename: "a.png", path: "/a.png", family: "image", status: "compressing" }],
    };
    const payload: FileDonePayload = {
      id: "1",
      family: "image",
      input_bytes: 100_000,
      output_bytes: 30_000,
      output_path: "/a_squished.png",
      reduction_percent: 70.0,
      duration_ms: 500,
      warnings: [],
    };
    const state = appReducer(prev, { type: "FILE_DONE", payload });
    expect(state.files[0].status).toBe("done");
    expect(state.files[0].inputBytes).toBe(100_000);
    expect(state.files[0].reductionPercent).toBe(70.0);
    expect(state.files[0].family).toBe("image");
    expect(state.files[0].warnings).toEqual([]);
  });

  it("FILE_ERROR marks file as errored", () => {
    const prev: AppState = {
      ...initialState(),
      status: "processing",
      files: [
        { id: "1", filename: "a.png", path: "/a.png", family: "image", status: "compressing" },
      ],
    };
    const payload: FileErrorPayload = {
      id: "1",
      family: "image",
      kind: "other",
      error: "decode failed",
    };
    const state = appReducer(prev, { type: "FILE_ERROR", payload });
    expect(state.files[0].status).toBe("error");
    expect(state.files[0].error).toBe("decode failed");
    expect(state.files[0].errorKind).toBe("other");
    expect(state.files[0].family).toBe("image");
  });

  it("BATCH_COMPLETE transitions to done", () => {
    const prev: AppState = {
      ...initialState(),
      status: "processing",
      files: [
        { id: "1", filename: "a.png", path: "/a.png", family: "image", status: "done" },
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
        { id: "1", filename: "a.png", path: "/a.png", family: "image", status: "done" },
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
        { id: "1", filename: "a.png", path: "/a.png", family: "image", status: "done" },
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

  it("UPDATE_SETTINGS merges partial image settings", () => {
    const state = appReducer(initialState(), {
      type: "UPDATE_SETTINGS",
      settings: { image: { lossless: true } },
    });
    expect(state.settings.image.lossless).toBe(true);
    expect(state.settings.image.quality).toBeNull(); // unchanged
  });

  it("UPDATE_SETTINGS merges image maxWidth, maxHeight, and suffix", () => {
    const state = appReducer(initialState(), {
      type: "UPDATE_SETTINGS",
      settings: { image: { maxWidth: 1920, maxHeight: 1080, suffix: "min" } },
    });
    expect(state.settings.image.maxWidth).toBe(1920);
    expect(state.settings.image.maxHeight).toBe(1080);
    expect(state.settings.image.suffix).toBe("min");
    expect(state.settings.image.quality).toBeNull(); // unchanged
  });

  it("UPDATE_SETTINGS merges top-level recursive without clobbering sub-settings", () => {
    const state = appReducer(initialState(), {
      type: "UPDATE_SETTINGS",
      settings: { recursive: true },
    });
    expect(state.settings.recursive).toBe(true);
    expect(state.settings.image).toEqual(DEFAULT_SETTINGS.image);
    expect(state.settings.audio).toEqual(DEFAULT_SETTINGS.audio);
  });

  it("UPDATE_SETTINGS deep-merges audio settings", () => {
    const state = appReducer(initialState(), {
      type: "UPDATE_SETTINGS",
      settings: { audio: { codec: "mp3", bitrateKbps: 192 } },
    });
    expect(state.settings.audio.codec).toBe("mp3");
    expect(state.settings.audio.bitrateKbps).toBe(192);
    expect(state.settings.audio.suffix).toBeNull(); // unchanged
  });
});

describe("migrateSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns defaults when localStorage is empty", () => {
    const s = migrateSettings();
    expect(s.image.quality).toBeNull();
    expect(s.image.lossless).toBe(false);
    expect(s.image.format).toBeNull();
    expect(s.recursive).toBe(false);
  });

  it("returns defaults when localStorage is empty — sub-family fields", () => {
    const s = migrateSettings();
    expect(s.image.maxWidth).toBeNull();
    expect(s.image.maxHeight).toBeNull();
    expect(s.image.suffix).toBeNull();
  });

  it("loads v2 settings from squish-settings-v2 key", () => {
    const stored = {
      ...DEFAULT_SETTINGS,
      recursive: true,
      image: { ...DEFAULT_SETTINGS.image, quality: 80, lossless: true },
    };
    localStorage.setItem("squish-settings-v2", JSON.stringify(stored));
    const s = migrateSettings();
    expect(s.recursive).toBe(true);
    expect(s.image.quality).toBe(80);
    expect(s.image.lossless).toBe(true);
    expect(s.image.format).toBeNull();
  });

  it("migrates v1 flat settings to v2 nested shape and writes v2 key", () => {
    localStorage.setItem(
      "squish-settings",
      JSON.stringify({ quality: 80, lossless: true }),
    );
    const s = migrateSettings();
    expect(s.image.quality).toBe(80);
    expect(s.image.lossless).toBe(true);
    expect(s.image.format).toBeNull();
    expect(s.recursive).toBe(false);
    // v1 key removed, v2 key written
    expect(localStorage.getItem("squish-settings")).toBeNull();
    expect(localStorage.getItem("squish-settings-v2")).not.toBeNull();
  });

  it("migrates v1 maxWidth, maxHeight, and suffix to image sub-object", () => {
    localStorage.setItem(
      "squish-settings",
      JSON.stringify({ maxWidth: 2560, maxHeight: 1440, suffix: "compressed" }),
    );
    const s = migrateSettings();
    expect(s.image.maxWidth).toBe(2560);
    expect(s.image.maxHeight).toBe(1440);
    expect(s.image.suffix).toBe("compressed");
  });

  it("loads v2 settings preserving maxWidth and maxHeight of 0", () => {
    const stored = {
      ...DEFAULT_SETTINGS,
      image: { ...DEFAULT_SETTINGS.image, maxWidth: 0, maxHeight: 0 },
    };
    localStorage.setItem("squish-settings-v2", JSON.stringify(stored));
    const s = migrateSettings();
    expect(s.image.maxWidth).toBe(0);
    expect(s.image.maxHeight).toBe(0);
  });
});
