import { useState } from "react";
import type { Settings, Family } from "../types";
import { ImageSettings } from "./ImageSettings";
import { AudioSettings } from "./AudioSettings";
import { VideoSettings } from "./VideoSettings";
import { CodeSettings } from "./CodeSettings";
import { TargetSizeSetting } from "./TargetSizeSetting";
import { FAMILY_META } from "../lib/families";
import { Icon, type IconName } from "./Icon";
import "./SettingsPanel.css";

interface SettingsPanelProps {
  settings: Settings;
  onChange: (update: Partial<Settings>) => void;
  queueFamilies?: Set<Family>;
  ffmpegAvailable?: boolean;
}

type SectionKey = Family | "general";

const sectionIcons: Record<SectionKey, IconName> = {
  general: "settings",
  image: "image",
  audio: "audio",
  video: "video",
  code: "code",
};

export function SettingsPanel({
  settings,
  onChange,
  queueFamilies,
  ffmpegAvailable = true,
}: SettingsPanelProps): JSX.Element {
  const targetSizeActive = settings.targetSizeBytes != null;
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<SectionKey>>(() => {
    const initial = new Set<SectionKey>();
    if (queueFamilies) {
      queueFamilies.forEach((f) => initial.add(f));
    }
    return initial;
  });

  const toggleSection = (key: SectionKey): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const isOpen = (key: SectionKey): boolean =>
    expanded.has(key) || (queueFamilies?.has(key as Family) ?? false);

  return (
    <div className="settings-panel">
      <button
        className="settings-panel__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Settings"
      >
        <span
          className={`settings-panel__toggle-icon${open ? " settings-panel__toggle-icon--open" : ""}`}
        >
          <Icon name="settings" size={16} />
        </span>
        <span className="settings-panel__toggle-label">Settings</span>
      </button>

      {open && (
        <div className="settings-panel__body">
          <div className="settings-panel__section">
            <button
              className="settings-panel__section-header"
              onClick={() => toggleSection("general")}
            >
              <Icon
                name="chevronRight"
                size={15}
                className={`settings-panel__chevron${isOpen("general") ? " settings-panel__chevron--open" : ""}`}
              />
              <span className="settings-panel__section-icon">
                <Icon name={sectionIcons.general} size={15} />
              </span>
              <span>General</span>
            </button>
            {isOpen("general") && (
              <div className="settings-panel__section-body">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.recursive}
                    onChange={(e) => onChange({ recursive: e.target.checked })}
                  />
                  Recurse into subdirectories
                </label>
                <TargetSizeSetting
                  valueBytes={settings.targetSizeBytes}
                  onChange={(bytes) => onChange({ targetSizeBytes: bytes })}
                />
              </div>
            )}
          </div>

          {(["image", "audio", "video", "code"] as Family[]).map((fam) => (
            <div key={fam} className="settings-panel__section">
              <button
                className="settings-panel__section-header"
                onClick={() => toggleSection(fam)}
              >
                <Icon
                  name="chevronRight"
                  size={15}
                  className={`settings-panel__chevron${isOpen(fam) ? " settings-panel__chevron--open" : ""}`}
                />
                <span className="settings-panel__section-icon">
                  <Icon name={sectionIcons[fam]} size={15} />
                </span>
                <span>{FAMILY_META[fam].label}</span>
                {queueFamilies?.has(fam) && (
                  <span className="settings-panel__badge">in batch</span>
                )}
              </button>
              {isOpen(fam) && (
                <div className="settings-panel__section-body">
                  {fam === "image" && (
                    <ImageSettings
                      value={settings.image}
                      targetSizeActive={targetSizeActive}
                      onChange={(u) =>
                        onChange({ image: { ...settings.image, ...u } })
                      }
                    />
                  )}
                  {fam === "audio" && (
                    <AudioSettings
                      value={settings.audio}
                      ffmpegAvailable={ffmpegAvailable}
                      targetSizeActive={targetSizeActive}
                      onChange={(u) =>
                        onChange({ audio: { ...settings.audio, ...u } })
                      }
                    />
                  )}
                  {fam === "video" && (
                    <VideoSettings
                      value={settings.video}
                      ffmpegAvailable={ffmpegAvailable}
                      targetSizeActive={targetSizeActive}
                      onChange={(u) =>
                        onChange({ video: { ...settings.video, ...u } })
                      }
                    />
                  )}
                  {fam === "code" && (
                    <CodeSettings
                      value={settings.code}
                      onChange={(u) =>
                        onChange({ code: { ...settings.code, ...u } })
                      }
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
