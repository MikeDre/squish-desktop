use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use walkdir::WalkDir;

#[derive(Deserialize)]
pub struct SquishOptionsPayload {
    pub quality: Option<u8>,
    pub lossless: bool,
    pub format: Option<String>,
    pub recursive: bool,
}

#[derive(Serialize, Clone)]
pub struct FileStartEvent {
    pub id: String,
    pub path: String,
    pub filename: String,
}

#[derive(Serialize, Clone)]
pub struct FileDoneEvent {
    pub id: String,
    pub input_bytes: u64,
    pub output_bytes: u64,
    pub output_path: String,
    pub reduction_percent: f64,
    pub duration_ms: u64,
}

#[derive(Serialize, Clone)]
pub struct FileErrorEvent {
    pub id: String,
    pub error: String,
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
}

#[tauri::command]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Expand paths: files pass through, directories are walked.
/// When `recursive` is false, only the top level of each directory is visited.
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

use squish_core::{squish_file, Format, SquishOptions};
use rayon::prelude::*;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

fn to_squish_options(payload: &SquishOptionsPayload) -> SquishOptions {
    SquishOptions {
        quality: payload.quality,
        lossless: payload.lossless,
        output_format: payload.format.as_deref().and_then(Format::parse),
        force_overwrite: false,
    }
}

/// Peek at the first 32 bytes to detect format. Returns None for unrecognized files.
fn peek_format(path: &PathBuf) -> Option<squish_core::Format> {
    use std::io::Read;
    let mut f = std::fs::File::open(path).ok()?;
    let mut head = [0u8; 32];
    let n = f.read(&mut head).ok()?;
    squish_core::detect_format(path, &head[..n])
}

#[tauri::command]
pub async fn squish_files(
    app: AppHandle,
    paths: Vec<String>,
    options: SquishOptionsPayload,
) -> Result<BatchResult, String> {
    let opts = to_squish_options(&options);
    let all_files = expand_paths(&paths, options.recursive);

    // Partition into known-format and skipped.
    let mut known: Vec<PathBuf> = Vec::new();
    let mut skipped_count: usize = 0;
    for path in &all_files {
        if peek_format(path).is_some() {
            known.push(path.clone());
        } else {
            skipped_count += 1;
        }
    }

    let start = Instant::now();
    let success_count = AtomicUsize::new(0);
    let error_count = AtomicUsize::new(0);
    let total_input = AtomicU64::new(0);
    let total_output = AtomicU64::new(0);

    // Emit file-start for all known files, assign IDs.
    let work_items: Vec<(String, PathBuf)> = known
        .into_iter()
        .enumerate()
        .map(|(i, path)| {
            let id = format!("file-{i}");
            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            let _ = app.emit("squish://file-start", FileStartEvent {
                id: id.clone(),
                path: path.display().to_string(),
                filename,
            });

            (id, path)
        })
        .collect();

    // Process in parallel with rayon.
    let results: Vec<(String, Result<squish_core::SquishResult, squish_core::SquishError>)> =
        work_items
            .into_par_iter()
            .map(|(id, path)| {
                let result = squish_file(&path, &opts);
                (id, result)
            })
            .collect();

    // Emit per-file results.
    for (id, result) in results {
        match result {
            Ok(r) => {
                success_count.fetch_add(1, Ordering::SeqCst);
                total_input.fetch_add(r.input_bytes, Ordering::SeqCst);
                total_output.fetch_add(r.output_bytes, Ordering::SeqCst);

                let _ = app.emit("squish://file-done", FileDoneEvent {
                    id,
                    input_bytes: r.input_bytes,
                    output_bytes: r.output_bytes,
                    output_path: r.output_path.display().to_string(),
                    reduction_percent: r.reduction_percent(),
                    duration_ms: r.duration.as_millis() as u64,
                });
            }
            Err(e) => {
                error_count.fetch_add(1, Ordering::SeqCst);

                let _ = app.emit("squish://file-error", FileErrorEvent {
                    id,
                    error: format!("{e}"),
                });
            }
        }
    }

    Ok(BatchResult {
        total_files: all_files.len(),
        success_count: success_count.load(Ordering::SeqCst),
        error_count: error_count.load(Ordering::SeqCst),
        skipped_count,
        total_input_bytes: total_input.load(Ordering::SeqCst),
        total_output_bytes: total_output.load(Ordering::SeqCst),
        total_duration_ms: start.elapsed().as_millis() as u64,
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
