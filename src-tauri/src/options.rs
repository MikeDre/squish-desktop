//! Per-family IPC option payloads and mappers to crate-native options.

use serde::Deserialize;
use squish_audio::{AudioCodec, AudioFormat, AudioOptions};
use squish_code::CodeOptions;
use squish_core::{Format, SquishOptions};
use squish_video::{VideoCodec, VideoFormat, VideoOptions};

#[allow(dead_code)]
#[derive(Deserialize, Default)]
pub struct BatchOptionsPayload {
    pub recursive: bool,
    pub force_overwrite: bool,
    pub target_size: Option<u64>,
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
    pub format: Option<String>, // AudioFormat::parse input, e.g. "mp3" | "aiff"
    pub suffix: Option<String>,
}

#[allow(dead_code)]
#[derive(Deserialize, Default)]
pub struct VideoOptionsPayload {
    pub codec: Option<String>,   // VideoCodec::parse input, e.g. "h264" | "hevc"
    pub quality: Option<u8>,     // 0-100 dial (NOT raw CRF)
    pub preset: Option<String>,  // payload-only; no crate-side field yet
    pub format: Option<String>,  // VideoFormat::parse input, e.g. "mp4" | "mkv"
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
    pub fn to_options(&self, force_overwrite: bool, target_size: Option<u64>) -> SquishOptions {
        SquishOptions {
            quality: self.quality,
            lossless: self.lossless,
            output_format: self.format.as_deref().and_then(Format::parse),
            force_overwrite,
            max_width: self.max_width.filter(|&w| w > 0),
            max_height: self.max_height.filter(|&h| h > 0),
            suffix: normalize_suffix(self.suffix.as_deref()),
            overwrite: false,
            target_size,
        }
    }
}

impl AudioOptionsPayload {
    pub fn to_options(&self, force_overwrite: bool, target_size: Option<u64>) -> AudioOptions {
        AudioOptions {
            codec: self.codec.as_deref().and_then(AudioCodec::parse),
            bitrate_kbps: self.bitrate_kbps,
            output_format: self.format.as_deref().and_then(AudioFormat::parse),
            force_overwrite,
            suffix: normalize_suffix(self.suffix.as_deref()),
            target_size,
            ..AudioOptions::default()
        }
    }
}

impl VideoOptionsPayload {
    pub fn to_options(&self, force_overwrite: bool, target_size: Option<u64>) -> VideoOptions {
        VideoOptions {
            quality: self.quality.map(|q| q.min(100)),
            codec: self.codec.as_deref().and_then(VideoCodec::parse),
            output_format: self.format.as_deref().and_then(VideoFormat::parse),
            force_overwrite,
            suffix: normalize_suffix(self.suffix.as_deref()),
            target_size,
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
        let o = p.to_options(false, None);
        assert!(o.max_width.is_none());
        assert!(o.max_height.is_none());
    }

    #[test]
    fn image_mapper_trims_and_nones_empty_suffix() {
        let p = ImageOptionsPayload {
            suffix: Some("   ".into()),
            ..Default::default()
        };
        assert!(p.to_options(false, None).suffix.is_none());

        let p = ImageOptionsPayload {
            suffix: Some("".into()),
            ..Default::default()
        };
        assert!(p.to_options(false, None).suffix.is_none());

        let p = ImageOptionsPayload {
            suffix: Some("  min  ".into()),
            ..Default::default()
        };
        assert_eq!(p.to_options(false, None).suffix.as_deref(), Some("min"));
    }

    #[test]
    fn audio_mapper_parses_codec_string_case_insensitive() {
        let p = AudioOptionsPayload {
            codec: Some("MP3".into()),
            bitrate_kbps: Some(192),
            ..Default::default()
        };
        let o = p.to_options(false, None);
        assert_eq!(o.codec, Some(AudioCodec::Mp3));
        assert_eq!(o.bitrate_kbps, Some(192));
    }

    #[test]
    fn audio_mapper_unknown_codec_string_yields_none() {
        let p = AudioOptionsPayload {
            codec: Some("wat".into()),
            ..Default::default()
        };
        assert!(p.to_options(false, None).codec.is_none());
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
        assert!(ImageOptionsPayload::default().to_options(true, None).force_overwrite);
        assert!(AudioOptionsPayload::default().to_options(true, None).force_overwrite);
        assert!(CodeOptionsPayload::default().to_options(true).force_overwrite);
    }

    #[test]
    fn video_mapper_maps_quality_codec_and_format() {
        let p = VideoOptionsPayload {
            quality: Some(80),
            codec: Some("hevc".into()),
            format: Some("mkv".into()),
            ..Default::default()
        };
        let o = p.to_options(false, None);
        assert_eq!(o.quality, Some(80));
        assert_eq!(o.codec, Some(squish_video::VideoCodec::H265));
        assert_eq!(o.output_format, Some(squish_video::VideoFormat::Mkv));
    }

    #[test]
    fn video_mapper_unknown_codec_and_format_yield_none() {
        let p = VideoOptionsPayload {
            codec: Some("wat".into()),
            format: Some("wat".into()),
            ..Default::default()
        };
        let o = p.to_options(false, None);
        assert_eq!(o.codec, None);
        assert_eq!(o.output_format, None);
    }

    #[test]
    fn audio_mapper_maps_output_format() {
        let p = AudioOptionsPayload {
            format: Some("aiff".into()),
            ..Default::default()
        };
        let o = p.to_options(false, None);
        assert_eq!(o.output_format, Some(squish_audio::AudioFormat::Aiff));

        let p = AudioOptionsPayload {
            format: Some("wat".into()),
            ..Default::default()
        };
        assert_eq!(p.to_options(false, None).output_format, None);
    }

    #[test]
    fn target_size_propagates_to_image_video_audio() {
        let ts = Some(1_000_000_u64);
        assert_eq!(ImageOptionsPayload::default().to_options(false, ts).target_size, ts);
        assert_eq!(VideoOptionsPayload::default().to_options(false, ts).target_size, ts);
        assert_eq!(AudioOptionsPayload::default().to_options(false, ts).target_size, ts);
    }

    #[test]
    fn target_size_none_by_default() {
        assert_eq!(ImageOptionsPayload::default().to_options(false, None).target_size, None);
        assert_eq!(VideoOptionsPayload::default().to_options(false, None).target_size, None);
        assert_eq!(AudioOptionsPayload::default().to_options(false, None).target_size, None);
    }
}
