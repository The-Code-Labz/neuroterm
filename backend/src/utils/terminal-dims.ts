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

// Coalesces rapid-fire 'resize' messages (dragging a NeuroDesk window,
// browser window resize, frontend ResizeObserver churn) into one actual
// pty/tmux resize per settle. Each resize call is a real SIGWINCH — tmux
// immediately reflows and fully repaints every attached client — so firing
// it on every single intermediate frame of a drag made the terminal look
// like it kept "resetting" (one resize's redraw getting stomped by the
// next before it finished, especially inside a full-screen app like nano).
// 'init' (the one-shot size sent right after connect) is applied
// immediately, uncoalesced — only ongoing 'resize' messages are debounced.
export const RESIZE_DEBOUNCE_MS = 80;

export function debounceResize(
  apply: (cols: number, rows: number) => void,
  delayMs: number = RESIZE_DEBOUNCE_MS
): (cols: number, rows: number) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (cols, rows) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; apply(cols, rows); }, delayMs);
  };
}
