import type { Settings } from '../../types';
import { DEFAULT_SETTINGS } from '../../types';

/** Shallow validity check for a parsed v2 Settings blob. */
export function isValidSettings(value: unknown): value is Settings {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Partial<Settings>;
  return (
    typeof s.recursive === 'boolean' &&
    typeof s.image === 'object' && s.image !== null &&
    typeof s.audio === 'object' && s.audio !== null &&
    typeof s.video === 'object' && s.video !== null &&
    typeof s.code  === 'object' && s.code  !== null
  );
}

/** Merge a possibly-partial v2 blob into full defaults so missing keys get filled. */
export function withDefaults(partial: Settings): Settings {
  return {
    recursive: partial.recursive ?? DEFAULT_SETTINGS.recursive,
    image: { ...DEFAULT_SETTINGS.image, ...partial.image },
    audio: { ...DEFAULT_SETTINGS.audio, ...partial.audio },
    video: { ...DEFAULT_SETTINGS.video, ...partial.video },
    code:  { ...DEFAULT_SETTINGS.code,  ...partial.code  },
  };
}
