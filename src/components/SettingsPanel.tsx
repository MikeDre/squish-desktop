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
        <span
          className={`settings-panel__toggle-icon${expanded ? " settings-panel__toggle-icon--open" : ""}`}
        >
          ⚙
        </span>
        Settings
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
            <label className="settings-panel__checkbox-label">
              <input
                type="checkbox"
                checked={settings.lossless}
                onChange={(e) => onChange({ lossless: e.target.checked })}
                aria-label="Lossless"
              />
              Lossless compression
            </label>
          </div>

          <div className="settings-panel__field">
            <label className="settings-panel__checkbox-label">
              <input
                type="checkbox"
                checked={settings.recursive}
                onChange={(e) => onChange({ recursive: e.target.checked })}
                aria-label="Include subfolders"
              />
              Include subfolders
            </label>
          </div>

          <div className="settings-panel__field">
            <label>Resize</label>
            <div className="settings-panel__resize-row">
              <input
                type="number"
                min="1"
                placeholder="Max width (px)"
                aria-label="Max width"
                value={settings.maxWidth ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") return onChange({ maxWidth: null });
                  const n = parseInt(raw, 10);
                  onChange({ maxWidth: Number.isNaN(n) ? null : n });
                }}
              />
              <input
                type="number"
                min="1"
                placeholder="Max height (px)"
                aria-label="Max height"
                value={settings.maxHeight ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") return onChange({ maxHeight: null });
                  const n = parseInt(raw, 10);
                  onChange({ maxHeight: Number.isNaN(n) ? null : n });
                }}
              />
            </div>
            <p className="settings-panel__hint">
              Images larger than these dimensions are scaled down proportionally. Never upscales.
            </p>
          </div>

          <details className="settings-panel__advanced">
            <summary>Advanced</summary>
            <div className="settings-panel__field">
              <label htmlFor="suffix">Output suffix</label>
              <input
                id="suffix"
                type="text"
                placeholder="squished"
                value={settings.suffix ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  onChange({ suffix: v === "" ? null : v });
                }}
              />
              <p className="settings-panel__hint">
                Filename suffix for compressed outputs. Default produces e.g. <code>dog_squished.png</code>.
              </p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
