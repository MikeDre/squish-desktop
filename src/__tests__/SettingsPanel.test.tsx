import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPanel } from "../components/SettingsPanel";
import { DEFAULT_SETTINGS } from "../types";

describe("SettingsPanel", () => {
  it("is collapsed by default — no section headers visible", () => {
    render(<SettingsPanel settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Image/i })).not.toBeInTheDocument();
  });

  it("renders all five section headers when the top-level toggle is clicked", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Settings/i }));

    expect(screen.getByRole("button", { name: /General/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Image/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Audio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Video/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Code/i })).toBeInTheDocument();
  });

  it("opens the Image section and reveals the Quality control", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Settings/i }));
    await user.click(screen.getByRole("button", { name: /Image/i }));

    expect(screen.getByLabelText(/Quality/i)).toBeInTheDocument();
  });

  it("opens the Audio section and reveals the Codec select", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Settings/i }));
    await user.click(screen.getByRole("button", { name: /Audio/i }));

    expect(screen.getByLabelText(/Codec/i)).toBeInTheDocument();
  });

  it("auto-expands sections listed in queueFamilies without clicking their header", async () => {
    const user = userEvent.setup();
    render(
      <SettingsPanel
        settings={DEFAULT_SETTINGS}
        onChange={vi.fn()}
        queueFamilies={new Set(["audio"])}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Settings/i }));

    expect(screen.getByLabelText(/Codec/i)).toBeInTheDocument();
  });

  it("shows the 'in batch' badge on sections whose family is in queueFamilies", async () => {
    const user = userEvent.setup();
    render(
      <SettingsPanel
        settings={DEFAULT_SETTINGS}
        onChange={vi.fn()}
        queueFamilies={new Set(["image", "video"])}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Settings/i }));

    const badges = screen.getAllByText("in batch");
    expect(badges).toHaveLength(2);
  });

  it("calls onChange with deep-merged image shape when lossless is toggled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SettingsPanel settings={DEFAULT_SETTINGS} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Settings/i }));
    await user.click(screen.getByRole("button", { name: /Image/i }));
    await user.click(screen.getByLabelText(/Lossless/i));

    expect(onChange).toHaveBeenCalledWith({
      image: { ...DEFAULT_SETTINGS.image, lossless: true },
    });
  });

  it("calls onChange with recursive true when General section toggle is used", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SettingsPanel settings={DEFAULT_SETTINGS} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Settings/i }));
    await user.click(screen.getByRole("button", { name: /General/i }));
    await user.click(screen.getByLabelText(/recurse into subdirectories/i));

    expect(onChange).toHaveBeenCalledWith({ recursive: true });
  });

  it("does not show the 'in batch' badge for families not in queueFamilies", async () => {
    const user = userEvent.setup();
    render(
      <SettingsPanel
        settings={DEFAULT_SETTINGS}
        onChange={vi.fn()}
        queueFamilies={new Set(["audio"])}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Settings/i }));

    const badges = screen.queryAllByText("in batch");
    expect(badges).toHaveLength(1);
  });
});

describe("target-size conflict handling", () => {
  function renderWithBudget() {
    const onChange = vi.fn();
    render(
      <SettingsPanel
        settings={{ ...DEFAULT_SETTINGS, targetSizeBytes: 1_000_000 }}
        onChange={onChange}
        queueFamilies={new Set(["image", "audio", "video"])}
        ffmpegAvailable={true}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    return onChange;
  }

  it("disables image quality and lossless", () => {
    renderWithBudget();
    expect(screen.getByLabelText(/^quality$/i)).toBeDisabled();
    expect(screen.getByLabelText(/lossless/i)).toBeDisabled();
  });

  it("disables video quality", () => {
    renderWithBudget();
    expect(screen.getByLabelText(/quality \(0–100/i)).toBeDisabled();
  });

  it("disables audio bitrate and lossless codec options", () => {
    renderWithBudget();
    expect(screen.getByLabelText(/bitrate/i)).toBeDisabled();
    expect(screen.getByRole("option", { name: /flac \(lossless\)/i })).toBeDisabled();
    expect(screen.getByRole("option", { name: /copy/i })).toBeDisabled();
  });
});

describe("media format dropdowns", () => {
  function renderPanel() {
    const onChange = vi.fn();
    render(
      <SettingsPanel
        settings={DEFAULT_SETTINGS}
        onChange={onChange}
        queueFamilies={new Set(["audio", "video"])}
        ffmpegAvailable={true}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    return onChange;
  }

  it("video format select emits the chosen container", () => {
    const onChange = renderPanel();
    fireEvent.change(screen.getByLabelText(/output format/i, { selector: "#vid-format" }), {
      target: { value: "mkv" },
    });
    expect(onChange).toHaveBeenCalledWith({ video: expect.objectContaining({ format: "mkv" }) });
  });

  it("audio format select emits the chosen container", () => {
    const onChange = renderPanel();
    fireEvent.change(screen.getByLabelText(/output format/i, { selector: "#aud-format" }), {
      target: { value: "aiff" },
    });
    expect(onChange).toHaveBeenCalledWith({ audio: expect.objectContaining({ format: "aiff" }) });
  });
});
