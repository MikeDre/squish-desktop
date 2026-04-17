import { useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-dialog";
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
            onDrop(event.payload.paths);
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
  }, [onDrop]);

  const handleBrowse = async () => {
    try {
      const result = await open({ multiple: true, directory: false });
      if (result && result.length > 0) {
        onDrop(result);
      }
    } catch {
      // User cancelled or dialog error — no-op.
    }
  };

  const statusText = () => {
    if (status === "processing") return "Drop more files to add to queue";
    return "Drop files here to compress";
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
        <div className="dropzone__icon">📁</div>
        <p className="dropzone__text">{statusText()}</p>
        <button
          className="dropzone__browse-btn"
          onClick={handleBrowse}
          aria-label="Browse files"
        >
          Browse files
        </button>
      </div>
    </div>
  );
}
