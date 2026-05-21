import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFfmpegStatus } from '../hooks/useFfmpegStatus';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

beforeEach(() => { invokeMock.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('useFfmpegStatus', () => {
  it('invokes check_ffmpeg on mount and exposes status', async () => {
    invokeMock.mockResolvedValueOnce({ ffmpeg: true, ffprobe: true });
    const { result } = renderHook(() => useFfmpegStatus());
    await waitFor(() => {
      expect(result.current.ffmpeg).toBe(true);
      expect(result.current.ffprobe).toBe(true);
    });
    expect(invokeMock).toHaveBeenCalledWith('check_ffmpeg');
  });

  it('recheck re-invokes and updates state', async () => {
    invokeMock
      .mockResolvedValueOnce({ ffmpeg: false, ffprobe: false })
      .mockResolvedValueOnce({ ffmpeg: true,  ffprobe: true  });

    const { result } = renderHook(() => useFfmpegStatus());
    await waitFor(() => expect(result.current.ffmpeg).toBe(false));

    await act(async () => { await result.current.recheck(); });
    expect(result.current.ffmpeg).toBe(true);
    expect(result.current.ffprobe).toBe(true);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});
