import type { BatchResult } from "../types";

interface SummaryProps {
  result: BatchResult;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function Summary({ result }: SummaryProps) {
  const saved = result.total_input_bytes > 0
    ? ((1 - result.total_output_bytes / result.total_input_bytes) * 100)
    : 0;

  return (
    <div className="summary">
      <span>
        Squished {result.success_count} files
        {" · "}
        {formatBytes(result.total_input_bytes)} → {formatBytes(result.total_output_bytes)}
        {" "}
        ({saved >= 0 ? `-${saved.toFixed(1)}` : `+${Math.abs(saved).toFixed(1)}`}%)
        {" · "}
        {formatDuration(result.total_duration_ms)}
      </span>
      {result.error_count > 0 && (
        <span className="summary__errors">
          {" · "}{result.error_count} failed
        </span>
      )}
    </div>
  );
}
