import type { ImageSettings as ImageSettingsType } from "../types";
import { FORMAT_OPTIONS } from "../types";
import "./ImageSettings.css";

interface Props {
  value: ImageSettingsType;
  onChange: (update: Partial<ImageSettingsType>) => void;
  targetSizeActive?: boolean;
}

export function ImageSettings({ value, onChange, targetSizeActive = false }: Props) {
  return (
    <div className="image-settings">
      <div className="image-settings__field">
        <label htmlFor="img-quality">Quality</label>
        <div className="image-settings__quality-row">
          <input
            id="img-quality"
            type="range"
            min={0}
            max={100}
            disabled={targetSizeActive}
            value={value.quality ?? 0}
            onChange={(e) =>
              onChange({ quality: e.target.value === "0" ? null : Number(e.target.value) })
            }
          />
          <span className="image-settings__quality-value">{value.quality ?? "auto"}</span>
        </div>
        {targetSizeActive && (
          <p className="image-settings__hint">Controlled by target size</p>
        )}
      </div>

      <div className="image-settings__field">
        <label>
          <input
            type="checkbox"
            disabled={targetSizeActive}
            checked={value.lossless}
            onChange={(e) => onChange({ lossless: e.target.checked })}
          />
          Lossless
        </label>
      </div>

      <div className="image-settings__field">
        <label htmlFor="img-format">Output format</label>
        <select
          id="img-format"
          value={value.format ?? ""}
          onChange={(e) => onChange({ format: e.target.value || null })}
        >
          {FORMAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="image-settings__row">
        <div className="image-settings__field">
          <label htmlFor="img-mw">Max width</label>
          <input
            id="img-mw"
            type="number"
            min={0}
            value={value.maxWidth ?? ""}
            placeholder="no limit"
            onChange={(e) =>
              onChange({ maxWidth: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </div>
        <div className="image-settings__field">
          <label htmlFor="img-mh">Max height</label>
          <input
            id="img-mh"
            type="number"
            min={0}
            value={value.maxHeight ?? ""}
            placeholder="no limit"
            onChange={(e) =>
              onChange({ maxHeight: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </div>
      </div>

      <div className="image-settings__field">
        <label htmlFor="img-suffix">Suffix</label>
        <input
          id="img-suffix"
          type="text"
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
