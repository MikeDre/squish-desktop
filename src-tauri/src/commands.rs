use rayon::prelude::*;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use crate::dispatch::{detect_kind, run_one, FileKind, UnifiedError};
use crate::ffmpeg;
use crate::options::BatchOptionsPayload;

#[derive(Serialize, Clone)]
pub struct FileStartEvent {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub family: FileKind,
}

#[derive(Serialize, Clone)]
pub struct FileDoneEvent {
    pub id: String,
    pub family: FileKind,
    pub input_bytes: u64,
    pub output_bytes: u64,
    pub output_path: String,
    pub reduction_percent: f64,
    pub duration_ms: u64,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct FileErrorEvent {
    pub id: String,
    pub family: FileKind,
    pub kind: String, // "missing_dependency" | "unsupported" | "parse_failed" | "io" | "other"
    pub error: String,
}

#[derive(Serialize, Default, Clone)]
pub struct FamilyStats {
    pub total: usize,
    pub success: usize,
    pub error: usize,
    pub skipped: usize,
}

#[derive(Serialize)]
pub struct ByFamily {
    pub image: FamilyStats,
    pub audio: FamilyStats,
    pub video: FamilyStats,
    pub code: FamilyStats,
}

#[derive(Serialize)]
pub struct BatchResult {
    pub total_files: usize,
    pub success_count: usize,
    pub error_count: usize,
    pub skipped_count: usize,
    pub total_input_bytes: u64,
    pub total_output_bytes: u64,
    pub total_duration_ms: u64,
    pub by_family: ByFamily,
}

#[tauri::command]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

pub fn expand_paths(paths: &[String], recursive: bool) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for p in paths {
        let path = PathBuf::from(p);
        if path.is_file() {
            files.push(path);
        } else if path.is_dir() {
            let mut walker = WalkDir::new(&path).follow_links(false);
            if !recursive {
                walker = walker.max_depth(1);
            }
            for entry in walker.into_iter().filter_map(|e| e.ok()) {
                if entry.file_type().is_file() {
                    files.push(entry.into_path());
                }
            }
        }
    }
    files
}

fn error_kind_str(e: &UnifiedError) -> &'static str {
    match e {
        UnifiedError::MissingDependency { .. } => "missing_dependency",
        UnifiedError::Unsupported { .. } => "unsupported",
        UnifiedError::ParseFailed { .. } => "parse_failed",
        UnifiedError::Io(_) => "io",
        UnifiedError::Other(_) => "other",
    }
}

#[tauri::command]
pub async fn squish_files(
    app: AppHandle,
    paths: Vec<String>,
    options: BatchOptionsPayload,
) -> Result<BatchResult, String> {
    let all_files = expand_paths(&paths, options.recursive);
    let ffmpeg_status = ffmpeg::cached();

    let work: Vec<(String, PathBuf, FileKind)> = all_files
        .iter()
        .enumerate()
        .map(|(i, path)| (format!("file-{i}"), path.clone(), detect_kind(path)))
        .collect();

    let mut family_stats: [(FileKind, FamilyStats); 4] = [
        (FileKind::Image, FamilyStats::default()),
        (FileKind::Audio, FamilyStats::default()),
        (FileKind::Video, FamilyStats::default()),
        (FileKind::Code, FamilyStats::default()),
    ];
    let mut skipped_count: usize = 0;

    for (_, _, kind) in &work {
        match kind {
            FileKind::Unknown => skipped_count += 1,
            other => {
                if let Some(slot) = family_stats.iter_mut().find(|(k, _)| k == other) {
                    slot.1.total += 1;
                }
            }
        }
    }

    let start = Instant::now();
    let success_count = AtomicUsize::new(0);
    let error_count = AtomicUsize::new(0);
    let total_input = AtomicU64::new(0);
    let total_output = AtomicU64::new(0);

    let dispatchable: Vec<(String, PathBuf, FileKind)> = work
        .into_iter()
        .filter(|(_, _, k)| !matches!(k, FileKind::Unknown))
        .map(|(id, path, kind)| {
            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();
            let _ = app.emit(
                "squish://file-start",
                FileStartEvent {
                    id: id.clone(),
                    path: path.display().to_string(),
                    filename,
                    family: kind,
                },
            );
            (id, path, kind)
        })
        .collect();

    let ffmpeg_ok = ffmpeg_status.ffmpeg && ffmpeg_status.ffprobe;

    let results: Vec<(String, FileKind, Result<crate::dispatch::UnifiedResult, UnifiedError>)> =
        dispatchable
            .into_par_iter()
            .map(|(id, path, kind)| {
                let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    run_one(&path, &options, ffmpeg_ok)
                }))
                .unwrap_or_else(|p| {
                    let msg = if let Some(s) = p.downcast_ref::<&str>() {
                        s.to_string()
                    } else if let Some(s) = p.downcast_ref::<String>() {
                        s.clone()
                    } else {
                        "panic".to_string()
                    };
                    Err(UnifiedError::Other(format!("internal error: {msg}")))
                });
                (id, kind, res)
            })
            .collect();

    for (id, kind, res) in results {
        match res {
            Ok(r) => {
                success_count.fetch_add(1, Ordering::SeqCst);
                total_input.fetch_add(r.input_bytes, Ordering::SeqCst);
                total_output.fetch_add(r.output_bytes, Ordering::SeqCst);
                if let Some(slot) = family_stats.iter_mut().find(|(k, _)| k == &kind) {
                    slot.1.success += 1;
                }
                let _ = app.emit(
                    "squish://file-done",
                    FileDoneEvent {
                        id,
                        family: kind,
                        input_bytes: r.input_bytes,
                        output_bytes: r.output_bytes,
                        output_path: r.output_path.display().to_string(),
                        reduction_percent: r.reduction_percent(),
                        duration_ms: r.duration.as_millis() as u64,
                        warnings: r.warnings,
                    },
                );
            }
            Err(e) => {
                error_count.fetch_add(1, Ordering::SeqCst);
                if let Some(slot) = family_stats.iter_mut().find(|(k, _)| k == &kind) {
                    slot.1.error += 1;
                }
                let _ = app.emit(
                    "squish://file-error",
                    FileErrorEvent {
                        id,
                        family: kind,
                        kind: error_kind_str(&e).to_string(),
                        error: format!("{e}"),
                    },
                );
            }
        }
    }

    let success = success_count.load(Ordering::SeqCst);
    let errors = error_count.load(Ordering::SeqCst);

    let by_family = ByFamily {
        image: family_stats[0].1.clone(),
        audio: family_stats[1].1.clone(),
        video: family_stats[2].1.clone(),
        code: family_stats[3].1.clone(),
    };

    Ok(BatchResult {
        total_files: all_files.len(),
        success_count: success,
        error_count: errors,
        skipped_count,
        total_input_bytes: total_input.load(Ordering::SeqCst),
        total_output_bytes: total_output.load(Ordering::SeqCst),
        total_duration_ms: start.elapsed().as_millis() as u64,
        by_family,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_version_returns_something() {
        let v = get_version();
        assert!(!v.is_empty());
    }

    #[test]
    fn expand_paths_with_nonexistent_path_returns_empty() {
        let result = expand_paths(&["/nonexistent/path/xyz".into()], false);
        assert!(result.is_empty());
    }

}
