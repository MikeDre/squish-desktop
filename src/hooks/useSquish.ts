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

export function useSquish(
  dispatch: React.Dispatch<AppAction>,
  settings: Settings
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
        if (!cancelled) {
          dispatch({
            type: "FILE_ERROR",
            id: event.payload.id,
            error: event.payload.error,
          });
        }
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
          options: {
            quality: settingsRef.current.quality,
            lossless: settingsRef.current.lossless,
            format: settingsRef.current.format,
            recursive: settingsRef.current.recursive,
          },
        });
        dispatch({ type: "BATCH_COMPLETE" });
        return result;
      } catch (err) {
        console.error("squish_files failed:", err);
        dispatch({ type: "BATCH_COMPLETE" });
        return null;
      }
    },
    [dispatch]
  );

  return { squishFiles };
}
