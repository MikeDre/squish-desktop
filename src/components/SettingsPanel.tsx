import { useState } from "react";
import type { Settings } from "../types";
import { FORMAT_OPTIONS } from "../types";
import "./SettingsPanel.css";

interface SettingsPanelProps {
  settings: Settings;
  onChange: (update: Partial<Settings>) => void;
}

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="settings-panel">
      <button
        className="settings-panel__toggle"
        onClick={() => setExpanded(!expanded)}
        aria-label="Settings"
        title="Settings"
      >
        {expanded ? "▾ Settings" : "⚙ Settings"}
      </button>

      {expanded && (
        <div className="settings-panel__body">
          <div className="settings-panel__field">
            <label htmlFor="quality">Quality</label>
            <div className="settings-panel__quality-row">
              <input
                id="quality"
                type="range"
                min="0"
                max="100"
                value={settings.quality ?? 0}
                disabled={settings.quality === null}
                onChange={(e) =>
                  onChange({ quality: parseInt(e.target.value, 10) })
                }
              />
              <label className="settings-panel__auto-label">
                <input
                  type="checkbox"
                  checked={settings.quality === null}
                  onChange={(e) =>
                    onChange({ quality: e.target.checked ? null : 80 })
                  }
                />
                Auto
              </label>
              {settings.quality !== null && (
                <span className="settings-panel__quality-value">
                  {settings.quality}
                </span>
              )}
            </div>
          </div>

          <div className="settings-panel__field">
            <label htmlFor="format">Format</label>
            <select
              id="format"
              value={settings.format ?? ""}
              onChange={(e) =>
                onChange({ format: e.target.value || null })
              }
            >
              {FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="settings-panel__field">
            <label>
              <input
                type="checkbox"
                checked={settings.lossless}
                onChange={(e) => onChange({ lossless: e.target.checked })}
                aria-label="Lossless"
              />
              {" "}Lossless compression
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
