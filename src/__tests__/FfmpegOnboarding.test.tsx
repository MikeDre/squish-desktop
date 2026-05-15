import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FfmpegOnboarding } from '../components/FfmpegOnboarding';

describe('FfmpegOnboarding', () => {
  it('renders install commands for macOS, Windows, Linux', async () => {
    render(<FfmpegOnboarding visible onRecheck={vi.fn()} />);
    // macOS shown by default; switch through tabs to surface all.
    expect(screen.getByText(/brew install ffmpeg/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Windows/i }));
    expect(screen.getByText(/winget install/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Linux/i }));
    expect(screen.getByText(/apt install ffmpeg|dnf install ffmpeg/)).toBeInTheDocument();
  });

  it('does not render when visible is false', () => {
    const { container } = render(<FfmpegOnboarding visible={false} onRecheck={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('Re-check button calls onRecheck', async () => {
    const onRecheck = vi.fn();
    render(<FfmpegOnboarding visible onRecheck={onRecheck} />);
    await userEvent.click(screen.getByRole('button', { name: /Re-check/i }));
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });
});
