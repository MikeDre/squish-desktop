import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface FfmpegStatus {
  ffmpeg: boolean;
  ffprobe: boolean;
}

export interface UseFfmpegStatus extends FfmpegStatus {
  loaded: boolean;
  recheck: () => Promise<void>;
}

export function useFfmpegStatus(): UseFfmpegStatus {
  const [status, setStatus] = useState<FfmpegStatus>({ ffmpeg: false, ffprobe: false });
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await invoke<FfmpegStatus>("check_ffmpeg");
      setStatus(next);
    } catch (err) {
      console.error("check_ffmpeg failed:", err);
      setStatus({ ffmpeg: false, ffprobe: false });
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...status, loaded, recheck: refresh };
}
