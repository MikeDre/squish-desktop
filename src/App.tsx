import { useReducer, useCallback, useState } from "react";
import { DropZone } from "./components/DropZone";
import { FileList } from "./components/FileList";
import { SettingsPanel } from "./components/SettingsPanel";
import { useSquish } from "./hooks/useSquish";
import { useTheme } from "./hooks/useTheme";
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
    case "START_BATCH": {
      const isActive = state.status === "processing";
      return {
        ...state,
        status: "processing",
        files: isActive ? state.files : [],
        activeBatches: state.activeBatches + 1,
      };
    }

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

    case "BATCH_COMPLETE": {
      const remaining = state.activeBatches - 1;
      return {
        ...state,
        status: remaining <= 0 ? "done" : "processing",
        activeBatches: Math.max(0, remaining),
      };
    }

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
  const { effectiveTheme, cycleTheme, theme } = useTheme();

  const handleDrop = useCallback(
    async (paths: string[]) => {
      if (state.status !== "processing") {
        setBatchResult(null);
      }
      dispatch({ type: "START_BATCH" });

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
      <div className="app__header">
        <button
          className="theme-toggle"
          onClick={cycleTheme}
          aria-label={`Theme: ${theme}`}
          title={`Theme: ${theme} (${effectiveTheme})`}
        >
          {effectiveTheme === "dark" ? "☀" : "☾"}
        </button>
      </div>
      <DropZone status={state.status} onDrop={handleDrop} />
      <SettingsPanel settings={state.settings} onChange={handleSettingsChange} />
      <FileList files={state.files} batchResult={batchResult} />
    </div>
  );
}

export default App;
