import type { BatchResult, Family, FamilyStats } from "../types";
import { FAMILY_META } from "../lib/families";
import "./Summary.css";

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

function pluralLabel(fam: Family, count: number): string {
  const base = FAMILY_META[fam].label.toLowerCase();
  if (count === 1) return base;
  if (fam === 'audio' || fam === 'video' || fam === 'code') return base; // mass-noun feel
  return `${base}s`;
}

export function Summary({ result }: SummaryProps) {
  const saved = result.total_input_bytes > 0
    ? ((1 - result.total_output_bytes / result.total_input_bytes) * 100)
    : 0;

  const families: Family[] = ['image', 'audio', 'video', 'code'];
  const nonEmpty = families
    .map((fam) => [fam, result.by_family[fam]] as [Family, FamilyStats])
    .filter(([, stats]) => stats.total > 0);

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

      {nonEmpty.length > 0 && (
        <div className="summary__families">
          {nonEmpty.map(([fam, stats]) => (
            <span key={fam} className="summary__family-pill">
              {FAMILY_META[fam].icon} {stats.success} {pluralLabel(fam, stats.success)}
            </span>
          ))}
        </div>
      )}

      {result.skipped_count > 0 && (
        <span className="summary__skipped">{" · "}{result.skipped_count} skipped</span>
      )}
      {result.error_count > 0 && (
        <span className="summary__errors">{" · "}{result.error_count} failed</span>
      )}
    </div>
  );
}
