//! File-kind detection and crate dispatch.

use serde::Serialize;
use std::time::Duration;

// Consumed by detect_kind in Task 3 and the dispatcher in Task 6+.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    Image,
    Audio,
    Video,
    Code,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum UnifiedError {
    MissingDependency { tool: String },
    Unsupported { reason: String },
    ParseFailed { reason: String, line: Option<u32> },
    Io(String),
    Other(String),
}

impl std::fmt::Display for UnifiedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UnifiedError::MissingDependency { tool } => write!(f, "missing dependency: {tool}"),
            UnifiedError::Unsupported { reason } => write!(f, "unsupported: {reason}"),
            UnifiedError::ParseFailed { reason, line: Some(l) } => {
                write!(f, "parse failed at line {l}: {reason}")
            }
            UnifiedError::ParseFailed { reason, line: None } => {
                write!(f, "parse failed: {reason}")
            }
            UnifiedError::Io(msg) => write!(f, "io error: {msg}"),
            UnifiedError::Other(msg) => write!(f, "{msg}"),
        }
    }
}

// Consumed by the dispatcher in Task 6+.
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct UnifiedResult {
    pub input_bytes: u64,
    pub output_bytes: u64,
    pub output_path: std::path::PathBuf,
    pub duration: Duration,
    pub warnings: Vec<String>,
}

impl UnifiedResult {
    pub fn reduction_percent(&self) -> f64 {
        if self.input_bytes == 0 {
            return 0.0;
        }
        (1.0 - (self.output_bytes as f64 / self.input_bytes as f64)) * 100.0
    }
}

// --- Native error → UnifiedError mappers ---

impl From<squish_core::SquishError> for UnifiedError {
    fn from(e: squish_core::SquishError) -> Self {
        use squish_core::SquishError as E;
        match e {
            E::Io(io) => UnifiedError::Io(io.to_string()),
            E::MissingDependency { name, .. } => {
                UnifiedError::MissingDependency { tool: name }
            }
            E::UnsupportedFormat { reason, .. } => UnifiedError::Unsupported { reason },
            other => {
                let msg = format!("{other}");
                if msg.to_lowercase().contains("unsupported")
                    || msg.to_lowercase().contains("unknown")
                {
                    UnifiedError::Unsupported { reason: msg }
                } else {
                    UnifiedError::Other(msg)
                }
            }
        }
    }
}

impl From<squish_audio::AudioError> for UnifiedError {
    fn from(e: squish_audio::AudioError) -> Self {
        use squish_audio::AudioError as E;
        match e {
            // Real field names: `name` and `install_hint` (not `tool`/`hint`)
            E::MissingDependency { name, .. } => {
                UnifiedError::MissingDependency { tool: name }
            }
            E::UnsupportedFormat { reason, .. } => UnifiedError::Unsupported { reason },
            E::NotAudio { path } => UnifiedError::Unsupported {
                reason: format!("not an audio file: {}", path.display()),
            },
            E::InvalidOption { reason } => UnifiedError::Unsupported { reason },
            E::Io(io) => UnifiedError::Io(io.to_string()),
            other => UnifiedError::Other(format!("{other}")),
        }
    }
}

impl From<squish_video::VideoError> for UnifiedError {
    fn from(e: squish_video::VideoError) -> Self {
        use squish_video::VideoError as E;
        match e {
            // Real field names: `name` and `install_hint` (not `tool`)
            E::MissingDependency { name, .. } => {
                UnifiedError::MissingDependency { tool: name }
            }
            E::UnsupportedFormat { reason, .. } => UnifiedError::Unsupported { reason },
            E::Io(io) => UnifiedError::Io(io.to_string()),
            other => UnifiedError::Other(format!("{other}")),
        }
    }
}

impl From<squish_code::CodeError> for UnifiedError {
    fn from(e: squish_code::CodeError) -> Self {
        use squish_code::CodeError as E;
        match e {
            E::UnsupportedFormat { reason, .. } => UnifiedError::Unsupported { reason },
            E::ParseFailed { reason, line, .. } => UnifiedError::ParseFailed { reason, line },
            E::Io(io) => UnifiedError::Io(io.to_string()),
            other => UnifiedError::Other(format!("{other}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_missing_dep_maps_to_missing_dependency() {
        // Real AudioError::MissingDependency fields are `name` and `install_hint`
        let e = squish_audio::AudioError::MissingDependency {
            name: "ffmpeg".into(),
            install_hint: String::new(),
        };
        let u: UnifiedError = e.into();
        assert!(matches!(u, UnifiedError::MissingDependency { tool } if tool == "ffmpeg"));
    }

    #[test]
    fn code_parse_failed_preserves_line() {
        let e = squish_code::CodeError::ParseFailed {
            path: std::path::PathBuf::from("/x.js"),
            line: Some(42),
            reason: "syntax".into(),
        };
        let u: UnifiedError = e.into();
        match u {
            UnifiedError::ParseFailed { line, reason } => {
                assert_eq!(line, Some(42));
                assert_eq!(reason, "syntax");
            }
            other => panic!("wrong variant: {other:?}"),
        }
    }

    #[test]
    fn reduction_percent_handles_zero_input() {
        let r = UnifiedResult {
            input_bytes: 0,
            output_bytes: 0,
            output_path: std::path::PathBuf::new(),
            duration: Duration::from_secs(0),
            warnings: vec![],
        };
        assert_eq!(r.reduction_percent(), 0.0);
    }
}
