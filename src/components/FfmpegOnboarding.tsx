import { useState } from "react";
import "./FfmpegOnboarding.css";

interface Props {
  visible: boolean;
  onRecheck: () => void | Promise<void>;
}

type Tab = 'mac' | 'win' | 'linux';

const COMMANDS: Record<Tab, string> = {
  mac:   'brew install ffmpeg',
  win:   'winget install Gyan.FFmpeg',
  linux: 'sudo apt install ffmpeg  # or: sudo dnf install ffmpeg',
};

export function FfmpegOnboarding({ visible, onRecheck }: Props) {
  const [tab, setTab] = useState<Tab>('mac');
  const [busy, setBusy] = useState(false);

  if (!visible) return null;

  const handleRecheck = async () => {
    setBusy(true);
    try { await onRecheck(); } finally { setBusy(false); }
  };

  return (
    <div className="ffmpeg-onboarding" role="alert">
      <h3 className="ffmpeg-onboarding__title">
        Install <code>ffmpeg</code> to compress audio and video
      </h3>
      <div className="ffmpeg-onboarding__tabs" role="tablist">
        {(['mac', 'win', 'linux'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`ffmpeg-onboarding__tab${tab === t ? ' ffmpeg-onboarding__tab--active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'mac' ? 'macOS' : t === 'win' ? 'Windows' : 'Linux'}
          </button>
        ))}
      </div>
      <pre className="ffmpeg-onboarding__cmd"><code>{COMMANDS[tab]}</code></pre>
      <button
        className="ffmpeg-onboarding__recheck"
        onClick={handleRecheck}
        disabled={busy}
      >
        {busy ? 'Checking…' : 'Re-check'}
      </button>
    </div>
  );
}
