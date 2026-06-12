// --- Family taxonomy ---
export type Family = 'image' | 'audio' | 'video' | 'code';

// --- Error kinds (mirrors UnifiedError variants in Rust dispatch.rs) ---
export type ErrorKind =
  | 'missing_dependency'
  | 'unsupported'
  | 'parse_failed'
  | 'io'
  | 'other';

// --- Tauri event payloads (must match Rust structs in commands.rs) ---

export interface FileStartPayload {
  id: string;
  path: string;
  filename: string;
  family: Family;
}

export interface FileDonePayload {
  id: string;
  family: Family;
  input_bytes: number;
  output_bytes: number;
  output_path: string;
  reduction_percent: number;
  duration_ms: number;
  warnings: string[];
}

export interface FileErrorPayload {
  id: string;
  family: Family;
  kind: ErrorKind;
  error: string;
}

export interface FamilyStats {
  total: number;
  success: number;
  error: number;
  skipped: number;
}

export interface BatchResult {
  total_files: number;
  success_count: number;
  error_count: number;
  skipped_count: number;
  total_input_bytes: number;
  total_output_bytes: number;
  total_duration_ms: number;
  by_family: {
    image: FamilyStats;
    audio: FamilyStats;
    video: FamilyStats;
    code: FamilyStats;
  };
}

// --- Frontend state ---

export type FileStatus = 'pending' | 'compressing' | 'done' | 'error';

export interface FileEntry {
  id: string;
  filename: string;
  path: string;
  family?: Family;
  status: FileStatus;
  inputBytes?: number;
  outputBytes?: number;
  reductionPercent?: number;
  outputPath?: string;
  durationMs?: number;
  warnings?: string[];
  error?: string;
  errorKind?: ErrorKind;
}

// --- Per-family settings ---

export interface ImageSettings {
  quality: number | null;
  lossless: boolean;
  format: string | null;
  maxWidth: number | null;
  maxHeight: number | null;
  suffix: string | null;
}

export type AudioCodec = 'copy' | 'mp3' | 'opus' | 'aac' | 'flac' | 'vorbis';

export interface AudioSettings {
  codec: AudioCodec | null;
  bitrateKbps: number | null;
  format: string | null;
  suffix: string | null;
}

export interface VideoSettings {
  codec: string | null;
  quality: number | null; // 0-100 dial (maps to VideoOptions.quality)
  preset: string | null;
  format: string | null;
  suffix: string | null;
}

export interface CodeSettings {
  sourceMap: boolean;
  suffix: string | null;
}

export interface Settings {
  recursive: boolean;
  targetSizeBytes: number | null;
  image: ImageSettings;
  audio: AudioSettings;
  video: VideoSettings;
  code: CodeSettings;
}

// --- App state ---

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
  | { type: 'FILE_ERROR'; payload: FileErrorPayload }
  | { type: 'BATCH_COMPLETE' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> };

// --- Defaults ---

export const DEFAULT_IMAGE: ImageSettings = {
  quality: null,
  lossless: false,
  format: null,
  maxWidth: null,
  maxHeight: null,
  suffix: null,
};

export const DEFAULT_AUDIO: AudioSettings = {
  codec: null,
  bitrateKbps: null,
  format: null,
  suffix: null,
};

export const DEFAULT_VIDEO: VideoSettings = {
  codec: null,
  quality: null,
  preset: null,
  format: null,
  suffix: null,
};

export const DEFAULT_CODE: CodeSettings = {
  sourceMap: false,
  suffix: null,
};

export const DEFAULT_SETTINGS: Settings = {
  recursive: false,
  targetSizeBytes: null,
  image: DEFAULT_IMAGE,
  audio: DEFAULT_AUDIO,
  video: DEFAULT_VIDEO,
  code: DEFAULT_CODE,
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

export const VIDEO_FORMAT_OPTIONS = [
  { value: '', label: 'Auto (preserve input)' },
  { value: 'mp4', label: 'MP4' },
  { value: 'webm', label: 'WebM' },
  { value: 'mov', label: 'MOV' },
  { value: 'mkv', label: 'MKV' },
] as const;

export const AUDIO_FORMAT_OPTIONS = [
  { value: '', label: 'Auto (match codec)' },
  { value: 'mp3', label: 'MP3' },
  { value: 'm4a', label: 'M4A' },
  { value: 'ogg', label: 'OGG' },
  { value: 'opus', label: 'Opus' },
  { value: 'flac', label: 'FLAC' },
  { value: 'wav', label: 'WAV' },
  { value: 'aiff', label: 'AIFF' },
] as const;

export const AUDIO_CODEC_OPTIONS = [
  { value: '', label: 'Auto (preserve / Opus)' },
  { value: 'copy', label: 'Copy (no re-encode)' },
  { value: 'mp3', label: 'MP3' },
  { value: 'opus', label: 'Opus' },
  { value: 'aac', label: 'AAC' },
  { value: 'flac', label: 'FLAC (lossless)' },
  { value: 'vorbis', label: 'Vorbis' },
] as const;

// --- Theme types ---
export type ThemePreference = 'system' | 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';
