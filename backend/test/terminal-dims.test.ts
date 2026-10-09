import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clampDims, debounceResize, MIN_COLS, MIN_ROWS, MAX_COLS, MAX_ROWS } from '../src/utils/terminal-dims';

describe('clampDims', () => {
  it('clamps below the minimum', () => {
    expect(clampDims(0, 0)).toEqual({ cols: MIN_COLS, rows: MIN_ROWS });
    expect(clampDims(-5, -5)).toEqual({ cols: MIN_COLS, rows: MIN_ROWS });
  });

  it('clamps above the maximum — prevents a memory-amplification resize DoS', () => {
    expect(clampDims(999_999_999, 999_999_999)).toEqual({ cols: MAX_COLS, rows: MAX_ROWS });
  });

  it('passes through in-range values unchanged', () => {
    expect(clampDims(120, 40)).toEqual({ cols: 120, rows: 40 });
  });

  it('falls back to the minimum for NaN input', () => {
    expect(clampDims(NaN, NaN)).toEqual({ cols: MIN_COLS, rows: MIN_ROWS });
  });
});

describe('debounceResize', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('coalesces a burst of rapid resizes into a single trailing call', () => {
    const apply = vi.fn();
    const resize = debounceResize(apply, 80);

    resize(100, 30);
    resize(101, 30);
    resize(102, 31);
    vi.advanceTimersByTime(79);
    expect(apply).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(apply).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith(102, 31);
  });

  it('fires again for a resize that settles after a previous one already fired', () => {
    const apply = vi.fn();
    const resize = debounceResize(apply, 80);

    resize(80, 24);
    vi.advanceTimersByTime(80);
    expect(apply).toHaveBeenCalledOnce();

    resize(90, 28);
    vi.advanceTimersByTime(80);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith(90, 28);
  });
});
