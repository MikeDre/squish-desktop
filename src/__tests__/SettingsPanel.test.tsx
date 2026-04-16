import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
