import type { CodeSettings as CodeSettingsType } from "../types";
import "./CodeSettings.css";

interface Props {
  value: CodeSettingsType;
  onChange: (update: Partial<CodeSettingsType>) => void;
}

export function CodeSettings({ value, onChange }: Props) {
  return (
    <div className="code-settings">
      <div className="code-settings__field">
        <label>
          <input
            type="checkbox"
            checked={value.sourceMap}
            onChange={(e) => onChange({ sourceMap: e.target.checked })}
          />
          Generate source map (.map file)
        </label>
      </div>
      <div className="code-settings__field">
        <label htmlFor="code-suffix">Suffix</label>
        <input
          id="code-suffix"
          type="text"
          value={value.suffix ?? ""}
          placeholder="min"
          onChange={(e) =>
            onChange({ suffix: e.target.value === "" ? null : e.target.value })
          }
        />
      </div>
    </div>
  );
}
