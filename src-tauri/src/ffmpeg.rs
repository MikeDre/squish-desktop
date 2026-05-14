//! ffmpeg/ffprobe detection. Cached at startup, refreshed on demand.

use serde::Serialize;
use std::sync::Mutex;

#[derive(Debug, Clone, Copy, Serialize, Default)]
pub struct FfmpegStatus {
    pub ffmpeg: bool,
    pub ffprobe: bool,
}

static CACHE: Mutex<FfmpegStatus> = Mutex::new(FfmpegStatus { ffmpeg: false, ffprobe: false });

/// Probe `ffmpeg -version` and `ffprobe -version`. Updates the cache and returns the result.
pub fn probe_and_cache() -> FfmpegStatus {
    let status = FfmpegStatus {
        ffmpeg: probe_one("ffmpeg"),
        ffprobe: probe_one("ffprobe"),
    };
    if let Ok(mut guard) = CACHE.lock() {
        *guard = status;
    }
    status
}

/// Read the cached status without re-probing.
pub fn cached() -> FfmpegStatus {
    CACHE.lock().map(|g| *g).unwrap_or_default()
}

fn probe_one(bin: &str) -> bool {
    use std::process::{Command, Stdio};
    Command::new(bin)
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[tauri::command]
pub fn check_ffmpeg() -> FfmpegStatus {
    probe_and_cache()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_returns_consistent_shape() {
        // Don't assume ffmpeg is or isn't installed; just verify
        // the function doesn't panic and the cache matches the return.
        let s = probe_and_cache();
        let cached = cached();
        assert_eq!(s.ffmpeg, cached.ffmpeg);
        assert_eq!(s.ffprobe, cached.ffprobe);
    }

    #[test]
    fn probe_one_nonexistent_returns_false() {
        assert!(!probe_one("definitely-not-a-real-binary-xyz-12345"));
    }
}
