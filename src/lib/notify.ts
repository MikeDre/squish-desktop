import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { BatchResult } from "../types";

/** Decimal byte formatter: 1500 → "1.5 KB", 2_100_000 → "2.1 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1_000;
  let i = 0;
  while (value >= 1_000 && i < units.length - 1) {
    value /= 1_000;
    i++;
  }
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${units[i]}`;
}

/** One-line summary for the completion notification. */
export function formatSummary(result: BatchResult): string {
  const parts = [`Squished ${result.success_count} files`];
  if (result.success_count > 0) {
    const saved = result.total_input_bytes - result.total_output_bytes;
    parts.push(`saved ${formatBytes(Math.max(0, saved))}`);
  }
  if (result.error_count > 0) parts.push(`${result.error_count} failed`);
  if (result.skipped_count > 0) parts.push(`${result.skipped_count} skipped`);
  return parts.join(" · ");
}

/** Request permission if needed, then post the completion notification. */
export async function notifyBatch(result: BatchResult): Promise<void> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      granted = (await requestPermission()) === "granted";
    }
    if (granted) {
      await sendNotification({ title: "squish", body: formatSummary(result) });
    }
  } catch {
    // Notification plugin unavailable (e.g. tests) — no-op.
  }
}
