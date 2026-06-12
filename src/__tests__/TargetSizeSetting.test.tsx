import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TargetSizeSetting } from "../components/TargetSizeSetting";

describe("TargetSizeSetting", () => {
  it("emits bytes using the selected decimal unit", () => {
    const onChange = vi.fn();
    render(<TargetSizeSetting valueBytes={null} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/target size/i), { target: { value: "1.5" } });
    expect(onChange).toHaveBeenLastCalledWith(1_500_000); // MB is the default unit

    fireEvent.change(screen.getByLabelText(/unit/i), { target: { value: "KB" } });
    expect(onChange).toHaveBeenLastCalledWith(1_500); // 1.5 KB
  });

  it("emits null when cleared", () => {
    const onChange = vi.fn();
    render(<TargetSizeSetting valueBytes={2_000_000} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/target size/i), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("displays an existing byte value in the best-fit unit", () => {
    render(<TargetSizeSetting valueBytes={8_000_000} onChange={() => {}} />);
    expect(screen.getByLabelText(/target size/i)).toHaveValue(8);
    expect(screen.getByLabelText(/unit/i)).toHaveValue("MB");
  });
});
