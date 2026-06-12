import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TargetSizeSetting } from "../components/TargetSizeSetting";

function Harness({ initial = null as number | null }) {
  const [bytes, setBytes] = useState<number | null>(initial);
  return <TargetSizeSetting valueBytes={bytes} onChange={setBytes} />;
}

describe("TargetSizeSetting", () => {
  it("emits bytes using the MB unit by default", () => {
    const onChange = vi.fn();
    render(<TargetSizeSetting valueBytes={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/target size/i), { target: { value: "1.5" } });
    expect(onChange).toHaveBeenLastCalledWith(1_500_000);
  });

  it("converts using the selected unit", () => {
    const onChange = vi.fn();
    render(<TargetSizeSetting valueBytes={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/unit/i), { target: { value: "KB" } });
    fireEvent.change(screen.getByLabelText(/target size/i), { target: { value: "1.5" } });
    expect(onChange).toHaveBeenLastCalledWith(1_500);
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

  it("reflects an externally changed valueBytes prop (regression)", () => {
    const { rerender } = render(<TargetSizeSetting valueBytes={8_000_000} onChange={() => {}} />);
    expect(screen.getByLabelText(/target size/i)).toHaveValue(8);
    rerender(<TargetSizeSetting valueBytes={null} onChange={() => {}} />);
    expect(screen.getByLabelText(/target size/i)).toHaveValue(null);
  });

  it("switching unit reflows the displayed amount without changing the budget (controlled)", () => {
    render(<Harness initial={8_000_000} />);
    expect(screen.getByLabelText(/target size/i)).toHaveValue(8); // 8 MB
    fireEvent.change(screen.getByLabelText(/unit/i), { target: { value: "KB" } });
    expect(screen.getByLabelText(/target size/i)).toHaveValue(8000); // same bytes, KB view
  });
});
