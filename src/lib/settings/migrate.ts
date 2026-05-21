import type { Settings } from '../../types';
import { DEFAULT_SETTINGS } from '../../types';
import { isValidSettings, withDefaults } from './schema';

export const SETTINGS_KEY_V1 = 'squish-settings';
export const SETTINGS_KEY_V2 = 'squish-settings-v2';

interface V1Settings {
  quality?: number | null;
  lossless?: boolean;
  format?: string | null;
  recursive?: boolean;
  maxWidth?: number | null;
  maxHeight?: number | null;
  suffix?: string | null;
}

function liftV1(v1: V1Settings): Settings {
  return {
    ...DEFAULT_SETTINGS,
    recursive: v1.recursive ?? DEFAULT_SETTINGS.recursive,
    image: {
      quality:   v1.quality   ?? DEFAULT_SETTINGS.image.quality,
      lossless:  v1.lossless  ?? DEFAULT_SETTINGS.image.lossless,
      format:    v1.format    ?? DEFAULT_SETTINGS.image.format,
      maxWidth:  v1.maxWidth  ?? DEFAULT_SETTINGS.image.maxWidth,
      maxHeight: v1.maxHeight ?? DEFAULT_SETTINGS.image.maxHeight,
      suffix:    v1.suffix    ?? DEFAULT_SETTINGS.image.suffix,
    },
  };
}

/**
 * Load settings from localStorage with v1 → v2 migration on first read.
 * Returns DEFAULT_SETTINGS (and warns) on any corruption.
 */
export function migrateSettings(): Settings {
  const v2Raw = localStorage.getItem(SETTINGS_KEY_V2);
  if (v2Raw !== null) {
    try {
      const parsed = JSON.parse(v2Raw);
      if (isValidSettings(parsed)) {
        return withDefaults(parsed);
      }
      console.warn('squish: v2 settings present but invalid; falling back to defaults');
    } catch {
      console.warn('squish: v2 settings parse failed; falling back to defaults');
    }
    return DEFAULT_SETTINGS;
  }

  const v1Raw = localStorage.getItem(SETTINGS_KEY_V1);
  if (v1Raw !== null) {
    try {
      const v1 = JSON.parse(v1Raw) as V1Settings;
      const lifted = liftV1(v1);
      localStorage.setItem(SETTINGS_KEY_V2, JSON.stringify(lifted));
      localStorage.removeItem(SETTINGS_KEY_V1);
      return lifted;
    } catch {
      console.warn('squish: v1 settings parse failed; falling back to defaults');
    }
  }

  localStorage.setItem(SETTINGS_KEY_V2, JSON.stringify(DEFAULT_SETTINGS));
  return DEFAULT_SETTINGS;
}

/** Save the current settings to v2 localStorage. Silently ignores quota errors. */
export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY_V2, JSON.stringify(settings));
  } catch {
    /* localStorage full or unavailable — ignored. */
  }
}
