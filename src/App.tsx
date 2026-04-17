import { useReducer, useCallback, useState } from "react";
import { DropZone } from "./components/DropZone";
import { FileList } from "./components/FileList";
import { SettingsPanel } from "./components/SettingsPanel";
import { useSquish } from "./hooks/useSquish";
import type {
  AppState,
  AppAction,
  Settings,
  BatchResult,
} from "./types";
import "./App.css";

const SETTINGS_KEY = "squish-settings";

export function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        quality: parsed.quality ?? null,
        lossless: parsed.lossless ?? false,
        format: parsed.format ?? null,
        recursive: parsed.recursive ?? false,
      };
    }
  } catch {
    // Corrupted localStorage — use defaults.
  }
  return { quality: null, lossless: false, format: null, recursive: false };
}

function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage full or unavailable — silently ignore.
  }
}

export function initialState(): AppState {
  return {
    status: "idle",
    files: [],
    settings: loadSettings(),
    activeBatches: 0,
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "START_BATCH":
      return {
        ...state,
        status: "processing",
        files: [],
      };

    case "FILE_START":
      return {
        ...state,
        files: [
          ...state.files,
          {
            id: action.payload.id,
            filename: action.payload.filename,
            path: action.payload.path,
            status: "compressing",
          },
        ],
      };

    case "FILE_DONE":
      return {
        ...state,
        files: state.files.map((f) =>
          f.id === action.payload.id
            ? {
                ...f,
                status: "done",
                inputBytes: action.payload.input_bytes,
                outputBytes: action.payload.output_bytes,
                outputPath: action.payload.output_path,
                reductionPercent: action.payload.reduction_percent,
                durationMs: action.payload.duration_ms,
              }
            : f
        ),
      };

    case "FILE_ERROR":
      return {
        ...state,
        files: state.files.map((f) =>
          f.id === action.id ? { ...f, status: "error", error: action.error } : f
        ),
      };

    case "BATCH_COMPLETE":
      return { ...state, status: "done" };

    case "UPDATE_SETTINGS": {
      const newSettings = { ...state.settings, ...action.settings };
      saveSettings(newSettings);
      return { ...state, settings: newSettings };
    }

    default:
      return state;
  }
}

function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, initialState);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const { squishFiles } = useSquish(dispatch, state.settings);

  const handleDrop = useCallback(
    async (paths: string[]) => {
      if (state.status === "processing") return;

      setBatchResult(null);
      dispatch({ type: "START_BATCH" });

      // Rust side expands directories, emits file-start events (which add rows),
      // then processes files and emits file-done/file-error events.
      const result = await squishFiles(paths);
      if (result) {
        setBatchResult(result);
      }
    },
    [state.status, squishFiles]
  );

  const handleSettingsChange = useCallback((update: Partial<Settings>) => {
    dispatch({ type: "UPDATE_SETTINGS", settings: update });
  }, []);

  return (
    <div className="app">
      <DropZone status={state.status} onDrop={handleDrop} />
      <SettingsPanel settings={state.settings} onChange={handleSettingsChange} />
      <FileList files={state.files} batchResult={batchResult} />
    </div>
  );
}

export default App;
