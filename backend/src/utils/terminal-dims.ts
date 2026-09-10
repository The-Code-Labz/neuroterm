// PTY/tmux windows below this size make no practical sense and, worse, force
// a real reflow of the remote scrollback (tmux/readline rewrap lines to the
// new width). A stray resize event driven by a hidden ( display:none ,
// 0x0 ) browser container previously collapsed sessions down to ~2x1,
// permanently mangling wrapped lines and scrollback history.
//
// Above MAX, cols/rows scale the memory tmux/the pty allocate for the grid
// (and, over SSH, what the remote tmux keeps in scrollback) — with no upper
// bound a client (or anyone able to reach the API/WS without a real browser
// in front of it) could request an arbitrarily huge grid as a cheap
// memory-amplification DoS per session. 1000x300 comfortably covers any real
// display (multi-monitor 8K ultrawide at a tiny font is nowhere close) while
// keeping a single session's grid allocation bounded.
//
// Clamp every resize we accept, client- and server-side, so neither extreme
// can happen.
export const MIN_COLS = 10;
export const MIN_ROWS = 3;
export const MAX_COLS = 1000;
export const MAX_ROWS = 300;

export function clampDims(cols: number, rows: number): { cols: number; rows: number } {
  return {
    cols: Math.min(MAX_COLS, Math.max(MIN_COLS, Math.floor(cols) || MIN_COLS)),
    rows: Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.floor(rows) || MIN_ROWS)),
  };
}
