import type { VideoSettings as VideoSettingsType } from "../types";
import "./VideoSettings.css";

interface Props {
  value: VideoSettingsType;
  onChange: (update: Partial<VideoSettingsType>) => void;
  ffmpegAvailable: boolean;
  targetSizeActive?: boolean;
}

export function VideoSettings({
  value,
  onChange,
  ffmpegAvailable,
  targetSizeActive = false,
}: Props) {
  const disabled = !ffmpegAvailable;
  return (
    <div className={`video-settings${disabled ? " video-settings--disabled" : ""}`}>
      {disabled && (
        <p className="video-settings__notice">
          Video compression requires <code>ffmpeg</code>. Install it to enable these controls.
        </p>
      )}
      <div className="video-settings__field">
        <label htmlFor="vid-codec">Codec</label>
        <input
          id="vid-codec"
          type="text"
          disabled={disabled}
          placeholder="auto"
          value={value.codec ?? ""}
          onChange={(e) => onChange({ codec: e.target.value || null })}
        />
      </div>
      <div className="video-settings__field">
        <label htmlFor="vid-quality">Quality (0–100, higher = better)</label>
        <input
          id="vid-quality"
          type="number"
          min={0}
          max={100}
          disabled={disabled || targetSizeActive}
          placeholder="default"
          value={value.quality ?? ""}
          onChange={(e) =>
            onChange({ quality: e.target.value === "" ? null : Number(e.target.value) })
          }
        />
        {targetSizeActive && (
          <p className="video-settings__hint">Controlled by target size</p>
        )}
      </div>
      <div className="video-settings__field">
        <label htmlFor="vid-preset">Preset</label>
        <input
          id="vid-preset"
          type="text"
          disabled={disabled}
          placeholder="medium"
          value={value.preset ?? ""}
          onChange={(e) => onChange({ preset: e.target.value || null })}
        />
      </div>
      <div className="video-settings__field">
        <label htmlFor="vid-suffix">Suffix</label>
        <input
          id="vid-suffix"
          type="text"
          disabled={disabled}
          value={value.suffix ?? ""}
          placeholder="squished"
          onChange={(e) =>
            onChange({ suffix: e.target.value === "" ? null : e.target.value })
          }
        />
      </div>
    </div>
  );
}
