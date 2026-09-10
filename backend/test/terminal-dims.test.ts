import { describe, it, expect } from 'vitest';
import { clampDims, MIN_COLS, MIN_ROWS, MAX_COLS, MAX_ROWS } from '../src/utils/terminal-dims';

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
