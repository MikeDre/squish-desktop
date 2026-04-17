// --- Tauri event payloads (must match Rust structs in commands.rs) ---

export interface FileStartPayload {
  id: string;
  path: string;
  filename: string;
}

export interface FileDonePayload {
  id: string;
  input_bytes: number;
  output_bytes: number;
  output_path: string;
  reduction_percent: number;
  duration_ms: number;
}

export interface FileErrorPayload {
  id: string;
  error: string;
}

export interface BatchResult {
  total_files: number;
  success_count: number;
  error_count: number;
  skipped_count: number;
  total_input_bytes: number;
  total_output_bytes: number;
  total_duration_ms: number;
}

// --- Frontend state ---

export type FileStatus = 'pending' | 'compressing' | 'done' | 'error';

export interface FileEntry {
  id: string;
  filename: string;
  path: string;
  status: FileStatus;
  inputBytes?: number;
  outputBytes?: number;
  reductionPercent?: number;
  outputPath?: string;
  durationMs?: number;
  error?: string;
}

export interface Settings {
  quality: number | null;  // null = format default
  lossless: boolean;
  format: string | null;   // null = preserve input format
  recursive: boolean;
}

export type AppStatus = 'idle' | 'processing' | 'done';

export interface AppState {
  status: AppStatus;
  files: FileEntry[];
  settings: Settings;
  activeBatches: number;
}

// --- Reducer actions ---

export type AppAction =
  | { type: 'START_BATCH' }
  | { type: 'FILE_START'; payload: FileStartPayload }
  | { type: 'FILE_DONE'; payload: FileDonePayload }
  | { type: 'FILE_ERROR'; id: string; error: string }
  | { type: 'BATCH_COMPLETE' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> };

// --- Settings defaults ---

export const DEFAULT_SETTINGS: Settings = {
  quality: null,
  lossless: false,
  format: null,
  recursive: false,
};

export const FORMAT_OPTIONS = [
  { value: '', label: 'Auto (preserve input)' },
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'svg', label: 'SVG' },
  { value: 'gif', label: 'GIF' },
  { value: 'heic', label: 'HEIC' },
] as const;

// --- Theme types ---
export type ThemePreference = 'system' | 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';
