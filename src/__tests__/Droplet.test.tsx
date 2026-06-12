import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Droplet } from "../components/Droplet";
import { DEFAULT_SETTINGS } from "../types";
import { SETTINGS_KEY_V2 } from "../lib/settings/migrate";
import { buildPayload } from "../lib/buildPayload";

// Capture the drag-drop handler so the test can fire a synthetic drop.
let dropHandler: ((event: { payload: { type: string; paths?: string[] } }) => void) | null = null;

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    onDragDropEvent: (cb: typeof dropHandler) => {
      dropHandler = cb;
      return Promise.resolve(() => {});
    },
  }),
}));

const invokeMock = vi.fn((..._args: unknown[]) =>
  Promise.resolve({
    total_files: 1,
    success_count: 1,
    error_count: 0,
    skipped_count: 0,
    total_input_bytes: 1000,
    total_output_bytes: 600,
    total_duration_ms: 5,
    by_family: {
      image: { total: 1, success: 1, error: 0, skipped: 0 },
      audio: { total: 0, success: 0, error: 0, skipped: 0 },
      video: { total: 0, success: 0, error: 0, skipped: 0 },
      code: { total: 0, success: 0, error: 0, skipped: 0 },
    },
  }),
);
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

const notifyBatchMock = vi.fn(() => Promise.resolve());
vi.mock("../lib/notify", () => ({ notifyBatch: () => notifyBatchMock() }));

beforeEach(() => {
  localStorage.clear();
  dropHandler = null;
  invokeMock.mockClear();
  notifyBatchMock.mockClear();
});

describe("Droplet", () => {
  it("squishes dropped files with saved settings, then notifies", async () => {
    localStorage.setItem(SETTINGS_KEY_V2, JSON.stringify(DEFAULT_SETTINGS));
    render(<Droplet />);

    await waitFor(() => expect(dropHandler).not.toBeNull());
    dropHandler!({ payload: { type: "drop", paths: ["/tmp/a.png"] } });

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock).toHaveBeenCalledWith("squish_files", {
      paths: ["/tmp/a.png"],
      options: buildPayload(DEFAULT_SETTINGS),
    });
    await waitFor(() => expect(notifyBatchMock).toHaveBeenCalledTimes(1));
  });

  it("ignores non-drop drag events", async () => {
    render(<Droplet />);
    await waitFor(() => expect(dropHandler).not.toBeNull());
    dropHandler!({ payload: { type: "over" } });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
