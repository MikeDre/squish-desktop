//! File-kind detection and crate dispatch.

use serde::Serialize;
use std::path::Path;
use std::time::Duration;

// Consumed by detect_kind in Task 3 and the dispatcher in Task 6+.
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

// --- File kind detection ---

/// Classify a file into one of the four families, or Unknown.
///
/// Extension-based for non-ambiguous formats. Ambiguous audio extensions
/// (e.g., `.ogg`, `.mka`) that may actually contain video are resolved
/// at the dispatch boundary via `ffprobe` — `detect_kind` itself does no
/// process work, keeping it cheap to call per file.
pub fn detect_kind(path: &Path) -> FileKind {
    if let Ok(bytes) = peek_head(path) {
        if squish_core::detect_format(path, &bytes).is_some() {
            return FileKind::Image;
        }
    }
    if squish_video::detect_video_format(path).is_some() {
        return FileKind::Video;
    }
    if squish_audio::detect_audio_format(path).is_some() {
        return FileKind::Audio;
    }
    if squish_code::detect_code_format(path).is_some() {
        return FileKind::Code;
    }
    FileKind::Unknown
}

fn peek_head(path: &Path) -> std::io::Result<Vec<u8>> {
    use std::io::Read;
    let mut f = std::fs::File::open(path)?;
    let mut head = [0u8; 32];
    let n = f.read(&mut head)?;
    Ok(head[..n].to_vec())
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
    use std::fs;
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn touch(dir: &TempDir, name: &str) -> PathBuf {
        let p = dir.path().join(name);
        fs::write(&p, b"\0\0\0\0").unwrap();
        p
    }

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

    #[test]
    fn detect_kind_image_from_extension() {
        let tmp = TempDir::new().unwrap();
        for name in ["a.jpg", "a.jpeg", "a.png", "a.webp", "a.gif"] {
            let p = touch(&tmp, name);
            assert_eq!(detect_kind(&p), FileKind::Image, "expected Image for {name}");
        }
    }

    #[test]
    fn detect_kind_video_from_extension() {
        let tmp = TempDir::new().unwrap();
        for name in ["a.mp4", "a.mkv", "a.webm"] {
            let p = touch(&tmp, name);
            assert_eq!(detect_kind(&p), FileKind::Video, "expected Video for {name}");
        }
    }

    #[test]
    fn detect_kind_code_from_extension() {
        let tmp = TempDir::new().unwrap();
        for name in ["a.js", "a.ts", "a.css", "a.html", "a.json"] {
            let p = touch(&tmp, name);
            assert_eq!(detect_kind(&p), FileKind::Code, "expected Code for {name}");
        }
    }

    #[test]
    fn detect_kind_unknown_extension() {
        let tmp = TempDir::new().unwrap();
        let p = touch(&tmp, "mystery.xyz");
        assert_eq!(detect_kind(&p), FileKind::Unknown);
    }

    #[test]
    fn detect_kind_image_via_magic_bytes_when_extension_lies() {
        // Real PNG magic bytes (8-byte signature) in a file with no .png extension.
        // This verifies peek_head + squish_core::detect_format's magic-byte fallback
        // is actually exercised, not just the extension-matching shortcut.
        let tmp = TempDir::new().unwrap();
        let p = tmp.path().join("mystery_image.bin");
        let png_magic: [u8; 8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        fs::write(&p, png_magic).unwrap();
        assert_eq!(detect_kind(&p), FileKind::Image);
    }
}
