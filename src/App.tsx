import { useReducer, useCallback, useState } from "react";
import { DropZone } from "./components/DropZone";
import { FileList } from "./components/FileList";
import { SettingsPanel } from "./components/SettingsPanel";
import { useSquish } from "./hooks/useSquish";
import { useTheme } from "./hooks/useTheme";
import { useFfmpegStatus } from "./hooks/useFfmpegStatus";
import { detectFamilyFromExtension } from "./lib/families";
import { migrateSettings, saveSettings } from "./lib/settings/migrate";
import type {
  AppState,
  AppAction,
  Settings,
  BatchResult,
  FileEntry,
  Family,
} from "./types";
import "./App.css";

export function initialState(): AppState {
  return {
    status: "idle",
    files: [],
    settings: migrateSettings(),
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

    case "FILE_START": {
      const entry: FileEntry = {
        id: action.payload.id,
        filename: action.payload.filename,
        path: action.payload.path,
        family: action.payload.family,
        status: "compressing",
      };
      return { ...state, files: [...state.files, entry] };
    }

    case "FILE_DONE":
      return {
        ...state,
        files: state.files.map((f) =>
          f.id === action.payload.id
            ? {
                ...f,
                status: "done",
                family: action.payload.family,
                inputBytes: action.payload.input_bytes,
                outputBytes: action.payload.output_bytes,
                outputPath: action.payload.output_path,
                reductionPercent: action.payload.reduction_percent,
                durationMs: action.payload.duration_ms,
                warnings: action.payload.warnings,
              }
            : f,
        ),
      };

    case "FILE_ERROR":
      return {
        ...state,
        files: state.files.map((f) =>
          f.id === action.payload.id
            ? {
                ...f,
                status: "error",
                family: action.payload.family,
                error: action.payload.error,
                errorKind: action.payload.kind,
              }
            : f,
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
      const merged: Settings = {
        ...state.settings,
        ...action.settings,
        image: { ...state.settings.image, ...action.settings.image },
        audio: { ...state.settings.audio, ...action.settings.audio },
        video: { ...state.settings.video, ...action.settings.video },
        code:  { ...state.settings.code,  ...action.settings.code  },
      };
      saveSettings(merged);
      return { ...state, settings: merged };
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
  const ffmpeg = useFfmpegStatus();

  const queueFamilies = (() => {
    const set = new Set<Family>();
    for (const f of state.files) {
      if (f.family) set.add(f.family);
      else {
        const fam = detectFamilyFromExtension(f.filename);
        if (fam) set.add(fam);
      }
    }
    return set;
  })();

  const handleDrop = useCallback(
    async (paths: string[]) => {
      if (state.status !== "processing") {
        setBatchResult(null);
      }
      dispatch({ type: "START_BATCH" });
      const result = await squishFiles(paths);
      if (result) setBatchResult(result);
    },
    [state.status, squishFiles],
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
      <SettingsPanel
        settings={state.settings}
        onChange={handleSettingsChange}
        queueFamilies={queueFamilies}
        ffmpegAvailable={ffmpeg.ffmpeg && ffmpeg.ffprobe}
      />
      <FileList files={state.files} batchResult={batchResult} />
    </div>
  );
}

export default App;
