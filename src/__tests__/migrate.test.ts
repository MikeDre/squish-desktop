import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migrateSettings, SETTINGS_KEY_V2, SETTINGS_KEY_V1 } from '../lib/settings/migrate';
import { DEFAULT_SETTINGS } from '../types';

describe('migrateSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns defaults when neither v1 nor v2 exists', () => {
    expect(migrateSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('loads v2 directly when present', () => {
    const v2 = { ...DEFAULT_SETTINGS, recursive: true };
    localStorage.setItem(SETTINGS_KEY_V2, JSON.stringify(v2));
    expect(migrateSettings().recursive).toBe(true);
  });

  it('migrates v1 flat shape into v2 image sub-object', () => {
    const v1 = {
      quality: 80, lossless: true, format: 'webp',
      recursive: true,
      maxWidth: 1920, maxHeight: 1080, suffix: 'small',
    };
    localStorage.setItem(SETTINGS_KEY_V1, JSON.stringify(v1));
    const out = migrateSettings();

    expect(out.recursive).toBe(true);
    expect(out.image.quality).toBe(80);
    expect(out.image.lossless).toBe(true);
    expect(out.image.format).toBe('webp');
    expect(out.image.maxWidth).toBe(1920);
    expect(out.image.maxHeight).toBe(1080);
    expect(out.image.suffix).toBe('small');
    expect(out.audio).toEqual(DEFAULT_SETTINGS.audio);
    expect(out.video).toEqual(DEFAULT_SETTINGS.video);
    expect(out.code).toEqual(DEFAULT_SETTINGS.code);
  });

  it('removes the v1 key after migrating', () => {
    localStorage.setItem(SETTINGS_KEY_V1, JSON.stringify({ quality: 70 }));
    migrateSettings();
    expect(localStorage.getItem(SETTINGS_KEY_V1)).toBeNull();
    expect(localStorage.getItem(SETTINGS_KEY_V2)).not.toBeNull();
  });

  it('falls back to defaults and warns when v2 is corrupted', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(SETTINGS_KEY_V2, 'not json{');
    const out = migrateSettings();
    expect(out).toEqual(DEFAULT_SETTINGS);
    expect(warn).toHaveBeenCalled();
  });

  it('falls back to defaults and warns when v2 is missing required fields', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(SETTINGS_KEY_V2, JSON.stringify({ foo: 1 }));
    const out = migrateSettings();
    expect(out).toEqual(DEFAULT_SETTINGS);
    expect(warn).toHaveBeenCalled();
  });

  it('fills targetSizeBytes and new format fields with defaults on old v2 blobs', () => {
    localStorage.setItem(
      SETTINGS_KEY_V2,
      JSON.stringify({
        recursive: true,
        image: {}, audio: {}, video: { crf: 23 }, code: {},
      }),
    );
    const s = migrateSettings();
    expect(s.targetSizeBytes).toBeNull();
    expect(s.video.quality).toBeNull(); // legacy crf is dropped, not mapped
    expect(s.video.format).toBeNull();
    expect(s.audio.format).toBeNull();
  });
});
