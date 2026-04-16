use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use walkdir::WalkDir;

#[derive(Deserialize)]
pub struct SquishOptionsPayload {
    pub quality: Option<u8>,
    pub lossless: bool,
    pub format: Option<String>,
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

/// Expand paths: files pass through, directories are walked (top-level only).
pub fn expand_paths(paths: &[String]) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for p in paths {
        let path = PathBuf::from(p);
        if path.is_file() {
            files.push(path);
        } else if path.is_dir() {
            let walker = WalkDir::new(&path)
                .follow_links(false)
                .max_depth(1);
            for entry in walker.into_iter().filter_map(|e| e.ok()) {
                if entry.file_type().is_file() {
                    files.push(entry.into_path());
                }
            }
        }
    }
    files
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
        let result = expand_paths(&["/nonexistent/path/xyz".into()]);
        assert!(result.is_empty());
    }
}
