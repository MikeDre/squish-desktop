//! Per-family IPC option payloads and mappers to crate-native options.

use serde::Deserialize;
use squish_audio::{AudioCodec, AudioOptions};
use squish_code::CodeOptions;
use squish_core::{Format, SquishOptions};
use squish_video::VideoOptions;

#[allow(dead_code)]
#[derive(Deserialize, Default)]
pub struct BatchOptionsPayload {
    pub recursive: bool,
    pub force_overwrite: bool,
    pub image: ImageOptionsPayload,
    pub audio: AudioOptionsPayload,
    pub video: VideoOptionsPayload,
    pub code: CodeOptionsPayload,
}

#[allow(dead_code)]
#[derive(Deserialize, Default)]
pub struct ImageOptionsPayload {
    pub quality: Option<u8>,
    pub lossless: bool,
    pub format: Option<String>,
    pub max_width: Option<u32>,
    pub max_height: Option<u32>,
    pub suffix: Option<String>,
}

#[allow(dead_code)]
#[derive(Deserialize, Default)]
pub struct AudioOptionsPayload {
    pub codec: Option<String>, // "copy" | "mp3" | "opus" | "aac" | "flac" | "vorbis" | "alac"
    pub bitrate_kbps: Option<u32>,
    pub suffix: Option<String>,
}

#[allow(dead_code)]
#[derive(Deserialize, Default)]
pub struct VideoOptionsPayload {
    pub codec: Option<String>,
    pub crf: Option<u8>,
    pub preset: Option<String>,
    pub suffix: Option<String>,
}

#[allow(dead_code)]
#[derive(Deserialize, Default)]
pub struct CodeOptionsPayload {
    pub source_map: bool,
    pub suffix: Option<String>,
}

fn normalize_suffix(s: Option<&str>) -> Option<String> {
    s.map(str::trim).filter(|s| !s.is_empty()).map(str::to_owned)
}

impl ImageOptionsPayload {
    pub fn to_options(&self, force_overwrite: bool) -> SquishOptions {
        SquishOptions {
            quality: self.quality,
            lossless: self.lossless,
            output_format: self.format.as_deref().and_then(Format::parse),
            force_overwrite,
            max_width: self.max_width.filter(|&w| w > 0),
            max_height: self.max_height.filter(|&h| h > 0),
            suffix: normalize_suffix(self.suffix.as_deref()),
        }
    }
}

impl AudioOptionsPayload {
    pub fn to_options(&self, force_overwrite: bool) -> AudioOptions {
        AudioOptions {
            codec: self.codec.as_deref().and_then(AudioCodec::parse),
            bitrate_kbps: self.bitrate_kbps,
            force_overwrite,
            suffix: normalize_suffix(self.suffix.as_deref()),
            ..AudioOptions::default()
        }
    }
}

impl VideoOptionsPayload {
    pub fn to_options(&self, force_overwrite: bool) -> VideoOptions {
        // VideoOptions 0.3.0 exposes codec, fast, quality, force_overwrite, suffix.
        // crf and preset are IPC-facing payload fields only; no matching VideoOptions
        // fields exist yet — the spread picks up the rest via default.
        VideoOptions {
            force_overwrite,
            suffix: normalize_suffix(self.suffix.as_deref()),
            ..VideoOptions::default()
        }
    }
}

impl CodeOptionsPayload {
    pub fn to_options(&self, force_overwrite: bool) -> CodeOptions {
        CodeOptions {
            source_map: self.source_map,
            force_overwrite,
            suffix: normalize_suffix(self.suffix.as_deref()),
            ..CodeOptions::default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn image_mapper_normalizes_zero_dims_to_none() {
        let p = ImageOptionsPayload {
            max_width: Some(0),
            max_height: Some(0),
            ..Default::default()
        };
        let o = p.to_options(false);
        assert!(o.max_width.is_none());
        assert!(o.max_height.is_none());
    }

    #[test]
    fn image_mapper_trims_and_nones_empty_suffix() {
        let p = ImageOptionsPayload {
            suffix: Some("   ".into()),
            ..Default::default()
        };
        assert!(p.to_options(false).suffix.is_none());

        let p = ImageOptionsPayload {
            suffix: Some("".into()),
            ..Default::default()
        };
        assert!(p.to_options(false).suffix.is_none());

        let p = ImageOptionsPayload {
            suffix: Some("  min  ".into()),
            ..Default::default()
        };
        assert_eq!(p.to_options(false).suffix.as_deref(), Some("min"));
    }

    #[test]
    fn audio_mapper_parses_codec_string_case_insensitive() {
        let p = AudioOptionsPayload {
            codec: Some("MP3".into()),
            bitrate_kbps: Some(192),
            ..Default::default()
        };
        let o = p.to_options(false);
        assert_eq!(o.codec, Some(AudioCodec::Mp3));
        assert_eq!(o.bitrate_kbps, Some(192));
    }

    #[test]
    fn audio_mapper_unknown_codec_string_yields_none() {
        let p = AudioOptionsPayload {
            codec: Some("wat".into()),
            ..Default::default()
        };
        assert!(p.to_options(false).codec.is_none());
    }

    #[test]
    fn code_mapper_passes_source_map_flag() {
        let p = CodeOptionsPayload {
            source_map: true,
            ..Default::default()
        };
        assert!(p.to_options(false).source_map);
    }

    #[test]
    fn force_overwrite_propagates_to_all_families() {
        assert!(ImageOptionsPayload::default().to_options(true).force_overwrite);
        assert!(AudioOptionsPayload::default().to_options(true).force_overwrite);
        assert!(CodeOptionsPayload::default().to_options(true).force_overwrite);
    }
}
