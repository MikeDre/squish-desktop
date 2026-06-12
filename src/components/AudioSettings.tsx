import type { AudioSettings as AudioSettingsType, AudioCodec } from "../types";
import { AUDIO_CODEC_OPTIONS } from "../types";
import "./AudioSettings.css";

interface Props {
  value: AudioSettingsType;
  onChange: (update: Partial<AudioSettingsType>) => void;
  ffmpegAvailable: boolean;
  targetSizeActive?: boolean;
}

export function AudioSettings({
  value,
  onChange,
  ffmpegAvailable,
  targetSizeActive = false,
}: Props) {
  const disabled = !ffmpegAvailable;
  return (
    <div className={`audio-settings${disabled ? " audio-settings--disabled" : ""}`}>
      {disabled && (
        <p className="audio-settings__notice">
          Audio compression requires <code>ffmpeg</code>. Install it to enable these controls.
        </p>
      )}
      <div className="audio-settings__field">
        <label htmlFor="aud-codec">Codec</label>
        <select
          id="aud-codec"
          disabled={disabled}
          value={value.codec ?? ""}
          onChange={(e) =>
            onChange({ codec: (e.target.value || null) as AudioCodec | null })
          }
        >
          {AUDIO_CODEC_OPTIONS.map((o) => (
            <option
              key={o.value}
              value={o.value}
              disabled={targetSizeActive && (o.value === "flac" || o.value === "copy")}
            >
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="audio-settings__field">
        <label htmlFor="aud-bitrate">Bitrate (kbps)</label>
        <input
          id="aud-bitrate"
          type="number"
          min={0}
          step={32}
          disabled={disabled || targetSizeActive}
          value={value.bitrateKbps ?? ""}
          placeholder="auto"
          onChange={(e) =>
            onChange({ bitrateKbps: e.target.value === "" ? null : Number(e.target.value) })
          }
        />
        {targetSizeActive && (
          <p className="audio-settings__hint">Controlled by target size</p>
        )}
      </div>
      <div className="audio-settings__field">
        <label htmlFor="aud-suffix">Suffix</label>
        <input
          id="aud-suffix"
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
