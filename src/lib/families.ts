import type { Family } from '../types';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'gif', 'svg']);
const AUDIO_EXTS = new Set(['mp3', 'flac', 'opus', 'aac', 'm4a', 'wav', 'ogg', 'oga', 'aiff', 'aif']);
const VIDEO_EXTS = new Set(['mp4', 'mkv', 'mov', 'webm', 'avi', 'm4v', 'mpg', 'mpeg']);
const CODE_EXTS  = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'css', 'html', 'htm', 'json']);

/**
 * Classify a filename by extension only. The Rust dispatcher remains authoritative;
 * this is just for "should the audio panel be visible?"-style UI decisions.
 */
export function detectFamilyFromExtension(filename: string): Family | null {
  const dot = filename.lastIndexOf('.');
  if (dot < 0 || dot === filename.length - 1) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (CODE_EXTS.has(ext))  return 'code';
  return null;
}

export interface FamilyMeta {
  label: string;
}

export const FAMILY_META: Record<Family, FamilyMeta> = {
  image: { label: 'Image' },
  audio: { label: 'Audio' },
  video: { label: 'Video' },
  code:  { label: 'Code' },
};
