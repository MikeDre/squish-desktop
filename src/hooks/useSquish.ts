import { useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  Settings,
  AppAction,
  FileStartPayload,
  FileDonePayload,
  FileErrorPayload,
  BatchResult,
} from "../types";

// Must stay in sync with the lossless members of AudioCodec in types.ts.
const LOSSLESS_AUDIO_CODECS = new Set(["flac", "copy"]);

function buildPayload(settings: Settings) {
  const budget = settings.targetSizeBytes;
  const hasBudget = budget != null;
  const audioCodec =
    hasBudget && settings.audio.codec && LOSSLESS_AUDIO_CODECS.has(settings.audio.codec)
      ? null
      : settings.audio.codec;

  return {
    recursive: settings.recursive,
    force_overwrite: false,
    target_size: budget,
    image: {
      quality: hasBudget ? null : settings.image.quality,
      lossless: hasBudget ? false : settings.image.lossless,
      format: settings.image.format,
      max_width: settings.image.maxWidth,
      max_height: settings.image.maxHeight,
      suffix: settings.image.suffix,
    },
    audio: {
      codec: audioCodec,
      bitrate_kbps: hasBudget ? null : settings.audio.bitrateKbps,
      format: settings.audio.format,
      suffix: settings.audio.suffix,
    },
    video: {
      codec: settings.video.codec,
      quality: hasBudget ? null : settings.video.quality,
      preset: settings.video.preset,
      format: settings.video.format,
      suffix: settings.video.suffix,
    },
    code: {
      source_map: settings.code.sourceMap,
      suffix: settings.code.suffix,
    },
  };
}

export function useSquish(
  dispatch: React.Dispatch<AppAction>,
  settings: Settings,
) {
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    async function setup() {
      const u1 = await listen<FileStartPayload>("squish://file-start", (event) => {
        if (!cancelled) dispatch({ type: "FILE_START", payload: event.payload });
      });
      if (cancelled) { u1(); return; }
      unlisteners.push(u1);

      const u2 = await listen<FileDonePayload>("squish://file-done", (event) => {
        if (!cancelled) dispatch({ type: "FILE_DONE", payload: event.payload });
      });
      if (cancelled) { u2(); return; }
      unlisteners.push(u2);

      const u3 = await listen<FileErrorPayload>("squish://file-error", (event) => {
        if (!cancelled) dispatch({ type: "FILE_ERROR", payload: event.payload });
      });
      if (cancelled) { u3(); return; }
      unlisteners.push(u3);
    }

    setup();
    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [dispatch]);

  const squishFiles = useCallback(
    async (paths: string[]): Promise<BatchResult | null> => {
      try {
        const result = await invoke<BatchResult>("squish_files", {
          paths,
          options: buildPayload(settingsRef.current),
        });
        dispatch({ type: "BATCH_COMPLETE" });
        return result;
      } catch (err) {
        console.error("squish_files failed:", err);
        dispatch({ type: "BATCH_COMPLETE" });
        return null;
      }
    },
    [dispatch],
  );

  return { squishFiles };
}

// Exported for testing.
export { buildPayload };
