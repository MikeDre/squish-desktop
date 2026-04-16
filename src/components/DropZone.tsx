import { useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { AppStatus } from "../types";
import "./DropZone.css";

interface DropZoneProps {
  status: AppStatus;
  onDrop: (paths: string[]) => void;
}

export function DropZone({ status, onDrop }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function setupDragDrop() {
      try {
        const appWindow = getCurrentWebviewWindow();
        const unlisten = await appWindow.onDragDropEvent((event) => {
          if (cancelled) return;

          if (event.payload.type === "over") {
            setIsDragOver(true);
          } else if (event.payload.type === "drop") {
            setIsDragOver(false);
            if (status !== "processing") {
              onDrop(event.payload.paths);
            }
          } else if (event.payload.type === "leave") {
            setIsDragOver(false);
          }
        });
        unlistenRef.current = unlisten;
      } catch {
        // Outside Tauri runtime (tests) — no-op.
      }
    }

    setupDragDrop();

    return () => {
      cancelled = true;
      unlistenRef.current?.();
    };
  }, [status, onDrop]);

  const statusText = () => {
    switch (status) {
      case "idle":
        return "Drop images here to compress";
      case "processing":
        return "Compressing...";
      case "done":
        return "Drop more images to compress";
    }
  };

  const className = [
    "dropzone",
    isDragOver ? "dropzone--drag-over" : "",
    status === "processing" ? "dropzone--processing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <div className="dropzone__content">
        <p className="dropzone__text">{statusText()}</p>
      </div>
    </div>
  );
}
