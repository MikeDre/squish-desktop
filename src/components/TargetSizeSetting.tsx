import { useState } from "react";
import "./TargetSizeSetting.css";

type Unit = "KB" | "MB" | "GB";

const UNIT_BYTES: Record<Unit, number> = {
  KB: 1_000,
  MB: 1_000_000,
  GB: 1_000_000_000,
};

interface TargetSizeSettingProps {
  valueBytes: number | null;
  onChange: (bytes: number | null) => void;
}

function bestFitUnit(bytes: number): Unit {
  if (bytes >= UNIT_BYTES.GB) return "GB";
  if (bytes >= UNIT_BYTES.MB) return "MB";
  return "KB";
}

export function TargetSizeSetting({
  valueBytes,
  onChange,
}: TargetSizeSettingProps): JSX.Element {
  const [unit, setUnit] = useState<Unit>(() =>
    valueBytes != null ? bestFitUnit(valueBytes) : "MB",
  );

  const amount = valueBytes != null ? valueBytes / UNIT_BYTES[unit] : null;

  return (
    <div className="target-size">
      <div className="target-size__field">
        <label htmlFor="target-size-amount">Target size (per file)</label>
        <div className="target-size__row">
          <input
            id="target-size-amount"
            type="number"
            min={0}
            step="any"
            placeholder="off"
            value={amount ?? ""}
            onChange={(e) =>
              onChange(
                e.target.value === ""
                  ? null
                  : Math.round(Number(e.target.value) * UNIT_BYTES[unit]),
              )
            }
          />
          <select
            aria-label="Unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value as Unit)}
          >
            <option value="KB">KB</option>
            <option value="MB">MB</option>
            <option value="GB">GB</option>
          </select>
        </div>
        <p className="target-size__hint">
          Fits each image, video, and audio file under this size. Quality and
          bitrate are chosen automatically. Code files are unaffected.
        </p>
      </div>
    </div>
  );
}
