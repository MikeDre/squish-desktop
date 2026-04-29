import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPanel } from "../components/SettingsPanel";
import { DEFAULT_SETTINGS } from "../types";

describe("SettingsPanel", () => {
  it("is collapsed by default", () => {
    render(
      <SettingsPanel settings={DEFAULT_SETTINGS} onChange={vi.fn()} />
    );
    expect(screen.queryByLabelText(/quality/i)).not.toBeInTheDocument();
  });

  it("expands when gear icon is clicked", async () => {
    const user = userEvent.setup();
    render(
      <SettingsPanel settings={DEFAULT_SETTINGS} onChange={vi.fn()} />
    );
    await user.click(screen.getByRole("button", { name: /settings/i }));
    expect(screen.getByLabelText(/quality/i)).toBeInTheDocument();
  });

  it("shows format dropdown", async () => {
    const user = userEvent.setup();
    render(
      <SettingsPanel settings={DEFAULT_SETTINGS} onChange={vi.fn()} />
    );
    await user.click(screen.getByRole("button", { name: /settings/i }));
    expect(screen.getByLabelText(/format/i)).toBeInTheDocument();
  });

  it("calls onChange when lossless is toggled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SettingsPanel settings={DEFAULT_SETTINGS} onChange={onChange} />
    );
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.click(screen.getByLabelText(/lossless/i));
    expect(onChange).toHaveBeenCalledWith({ lossless: true });
  });

  it("shows recursive toggle when expanded", async () => {
    const user = userEvent.setup();
    render(
      <SettingsPanel settings={DEFAULT_SETTINGS} onChange={vi.fn()} />
    );
    await user.click(screen.getByRole("button", { name: /settings/i }));
    expect(screen.getByLabelText(/include subfolders/i)).toBeInTheDocument();
  });

  it("calls onChange when recursive is toggled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SettingsPanel settings={DEFAULT_SETTINGS} onChange={onChange} />
    );
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.click(screen.getByLabelText(/include subfolders/i));
    expect(onChange).toHaveBeenCalledWith({ recursive: true });
  });

  it("shows max width and max height inputs when expanded", async () => {
    const user = userEvent.setup();
    render(
      <SettingsPanel settings={DEFAULT_SETTINGS} onChange={vi.fn()} />
    );
    await user.click(screen.getByRole("button", { name: /settings/i }));
    expect(screen.getByLabelText(/max width/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max height/i)).toBeInTheDocument();
  });

  it("calls onChange with maxWidth when max width is typed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SettingsPanel settings={DEFAULT_SETTINGS} onChange={onChange} />
    );
    await user.click(screen.getByRole("button", { name: /settings/i }));
    fireEvent.change(screen.getByLabelText(/max width/i), {
      target: { value: "1920" },
    });
    expect(onChange).toHaveBeenLastCalledWith({ maxWidth: 1920 });
  });

  it("calls onChange with maxWidth null when input is cleared", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const populated = { ...DEFAULT_SETTINGS, maxWidth: 1920 };
    render(<SettingsPanel settings={populated} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.clear(screen.getByLabelText(/max width/i));
    expect(onChange).toHaveBeenLastCalledWith({ maxWidth: null });
  });
});
