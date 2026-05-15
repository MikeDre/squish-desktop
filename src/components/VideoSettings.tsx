import type { VideoSettings as VideoSettingsType } from "../types";
import "./VideoSettings.css";

interface Props {
  value: VideoSettingsType;
  onChange: (update: Partial<VideoSettingsType>) => void;
  ffmpegAvailable: boolean;
}

export function VideoSettings({ value, onChange, ffmpegAvailable }: Props) {
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
        <label htmlFor="vid-crf">CRF (quality, lower = better)</label>
        <input
          id="vid-crf"
          type="number"
          min={0}
          max={51}
          disabled={disabled}
          placeholder="default"
          value={value.crf ?? ""}
          onChange={(e) =>
            onChange({ crf: e.target.value === "" ? null : Number(e.target.value) })
          }
        />
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
