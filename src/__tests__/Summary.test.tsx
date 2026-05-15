import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Summary } from '../components/Summary';
import type { BatchResult } from '../types';

function buildResult(over: Partial<BatchResult> = {}): BatchResult {
  return {
    total_files: 5,
    success_count: 4,
    error_count: 0,
    skipped_count: 1,
    total_input_bytes: 1024 * 1024,
    total_output_bytes: 512 * 1024,
    total_duration_ms: 1500,
    by_family: {
      image: { total: 2, success: 2, error: 0, skipped: 0 },
      audio: { total: 1, success: 1, error: 0, skipped: 0 },
      video: { total: 0, success: 0, error: 0, skipped: 0 },
      code:  { total: 1, success: 1, error: 0, skipped: 0 },
    },
    ...over,
  };
}

describe('Summary', () => {
  it('renders top-line counts', () => {
    render(<Summary result={buildResult()} />);
    expect(screen.getByText(/Squished 4 files/)).toBeInTheDocument();
  });

  it('renders per-family breakdown for non-empty families', () => {
    render(<Summary result={buildResult()} />);
    expect(screen.getByText(/2 images?/i)).toBeInTheDocument();
    expect(screen.getByText(/1 audio/i)).toBeInTheDocument();
    expect(screen.getByText(/1 code/i)).toBeInTheDocument();
    expect(screen.queryByText(/0 videos?/i)).not.toBeInTheDocument();
  });

  it('renders skipped count', () => {
    render(<Summary result={buildResult({ skipped_count: 3 })} />);
    expect(screen.getByText(/3 skipped/i)).toBeInTheDocument();
  });
});
