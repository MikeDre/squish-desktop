import type { Settings } from "../types";

// Codecs a size budget can't drive: lossless (flac) has no bitrate dial, and
// copy doesn't re-encode. Matches the crate's target-size rejection set.
const BUDGET_INCOMPATIBLE_AUDIO_CODECS = new Set(["flac", "copy"]);

export function buildPayload(settings: Settings) {
  const budget = settings.targetSizeBytes;
  const hasBudget = budget != null;
  const audioCodec =
    hasBudget && settings.audio.codec && BUDGET_INCOMPATIBLE_AUDIO_CODECS.has(settings.audio.codec)
      ? null
      : settings.audio.codec;

  return {
    recursive: settings.recursive,
    force_overwrite: false,
    target_size: budget,
    image: {
      quality: hasBudget ? null : settings.image.quality,
      lossless: hasBudget ? false : settings.image.lossless,
      format: settings.image.format,
      max_width: settings.image.maxWidth,
      max_height: settings.image.maxHeight,
      suffix: settings.image.suffix,
    },
    audio: {
      codec: audioCodec,
      bitrate_kbps: hasBudget ? null : settings.audio.bitrateKbps,
      format: settings.audio.format,
      suffix: settings.audio.suffix,
    },
    video: {
      codec: settings.video.codec,
      quality: hasBudget ? null : settings.video.quality,
      preset: settings.video.preset,
      format: settings.video.format,
      suffix: settings.video.suffix,
    },
    code: {
      source_map: settings.code.sourceMap,
      suffix: settings.code.suffix,
    },
  };
}
