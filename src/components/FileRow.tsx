import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { FileEntry } from "../types";
import "./FileRow.css";

interface FileRowProps {
  file: FileEntry;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileRow({ file }: FileRowProps) {
  const handleReveal = async () => {
    if (file.outputPath) {
      try {
        await revealItemInDir(file.outputPath);
      } catch {
        // Opener failed — no-op.
      }
    }
  };

  return (
    <div className={`file-row file-row--${file.status}`}>
      <div className="file-row__status-dot" />
      <div className="file-row__name">{file.filename}</div>

      {(file.status === "pending" || file.status === "compressing") && (
        <div className="file-row__progress">
          <div
            role="progressbar"
            className="file-row__progress-bar"
            aria-label={`Compressing ${file.filename}`}
          >
            <div className="file-row__progress-fill" />
          </div>
        </div>
      )}

      {file.status === "done" && file.inputBytes != null && file.outputBytes != null && (
        <div className="file-row__result">
          <span className="file-row__sizes">
            {formatBytes(file.inputBytes)} → {formatBytes(file.outputBytes)}
          </span>
          <span className="file-row__savings">
            {file.reductionPercent != null && file.reductionPercent >= 0
              ? `-${file.reductionPercent.toFixed(1)}%`
              : `+${Math.abs(file.reductionPercent ?? 0).toFixed(1)}%`}
          </span>
          {file.outputPath && (
            <button
              className="file-row__reveal-btn"
              onClick={handleReveal}
              aria-label="Show in Finder"
              title="Show in Finder"
            >
              ↗
            </button>
          )}
        </div>
      )}

      {file.status === "error" && (
        <div className="file-row__error">{file.error}</div>
      )}
    </div>
  );
}
