import { useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { migrateSettings } from "../lib/settings/migrate";
import { buildPayload } from "../lib/buildPayload";
import { notifyBatch } from "../lib/notify";
import type { BatchResult } from "../types";
import { Icon } from "./Icon";
import "./Droplet.css";

type DropletState = "idle" | "busy";

export function Droplet() {
  const [state, setState] = useState<DropletState>("idle");
  const [isDragOver, setIsDragOver] = useState(false);
  const busyRef = useRef(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function squish(paths: string[]): Promise<void> {
      // Ignore drops while a batch is running.
      if (busyRef.current || paths.length === 0) return;
      busyRef.current = true;
      setState("busy");
      try {
        // Read settings fresh on each drop so the latest saved values win.
        const options = buildPayload(migrateSettings());
        const result = await invoke<BatchResult>("squish_files", { paths, options });
        await notifyBatch(result);
      } catch (err) {
        console.error("droplet squish failed:", err);
      } finally {
        busyRef.current = false;
        if (!cancelled) setState("idle");
      }
    }

    async function setup(): Promise<void> {
      try {
        const win = getCurrentWebviewWindow();
        const unlisten = await win.onDragDropEvent((event) => {
          if (cancelled) return;
          if (event.payload.type === "over") setIsDragOver(true);
          else if (event.payload.type === "leave") setIsDragOver(false);
          else if (event.payload.type === "drop") {
            setIsDragOver(false);
            void squish(event.payload.paths);
          }
        });
        unlistenRef.current = unlisten;
      } catch {
        // Outside Tauri runtime (tests) — no-op.
      }
    }

    setup();
    return () => {
      cancelled = true;
      unlistenRef.current?.();
    };
  }, []);

  const className = [
    "droplet",
    isDragOver ? "droplet--drag-over" : "",
    state === "busy" ? "droplet--busy" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <div className="droplet__icon">
        <Icon name={state === "busy" ? "spinner" : "archive"} size={28} />
      </div>
      <p className="droplet__text">{state === "busy" ? "Squishing..." : "Drop to squish"}</p>
    </div>
  );
}
