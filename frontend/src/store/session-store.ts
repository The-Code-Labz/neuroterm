import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ConnectionMode  = 'ssh' | 'local';
export type AuthMode        = 'password' | 'privateKey';
export type TerminalStatus  = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type TerminalViewMode = 'tabs' | 'desktop' | 'explorer';

export interface WindowLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  maximized: boolean;
  zIndex: number;
}

export interface Connection {
  id: string;
  name: string;
  mode: ConnectionMode;
  host: string;
  port: number;
  username: string;
  authMode: AuthMode;
  password?: string;
  privateKey?: string;
  tmuxSession: string;
  backendId?: string; // DB id from backend connections table (SSH only)
  credentialId?: string; // saved credential profile id (SSH only)
  createdAt: string;
  updatedAt: string;
}

export type ConnectionInput = Omit<Connection, 'id' | 'createdAt' | 'updatedAt'>;

export interface TerminalTab {
  id: string;
  sessionId: string;    // backend terminal_sessions.id
  connectionId: string;
  title: string;
  mode: ConnectionMode;
  host: string;
  port: number;
  username: string;
  tmuxSession: string;
  status: TerminalStatus;
  createdAt: string;
}

interface SessionState {
  connections: Connection[];
  tabs: TerminalTab[];
  activeTabId: string | null;
  viewMode: TerminalViewMode;
  windowLayouts: Record<string, WindowLayout>;
  focusedWindowKey: string | null;

  replaceConnections: (connections: Connection[]) => void;
  addConnection: (input: ConnectionInput) => Connection;
  updateConnection: (id: string, input: ConnectionInput) => Connection | null;
  deleteConnection: (id: string) => void;

  openTab: (connection: Connection, sessionId: string) => TerminalTab;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabStatus: (id: string, status: TerminalStatus) => void;

  setViewMode: (mode: TerminalViewMode) => void;
  setWindowLayout: (key: string, layout: Partial<WindowLayout>) => void;
  focusWindow: (key: string) => void;
  clearFocus: () => void;
  removeWindowLayout: (key: string) => void;
}

const DEFAULT_LAYOUT: Omit<WindowLayout, 'zIndex'> = {
  x: 40,
  y: 40,
  width: 720,
  height: 460,
  minimized: false,
  maximized: false,
};

// Stable key for a window's persisted layout — tied to the connection +
// tmux session (same identity used for tab dedup in `openTab`), not the
// ephemeral tab id, so a NeuroDesk window keeps its position/size across
// reconnects instead of resetting every time the tab is recreated.
export const windowKey = (tab: Pick<TerminalTab, 'connectionId' | 'tmuxSession'>): string =>
  `${tab.connectionId}:${tab.tmuxSession}`;

// Technical identity line shown in tab/window chrome. Local sessions have no
// meaningful username@host (the form doesn't collect one), so fall back to
// the tmux session name rather than rendering a bare "@".
export const tabIdentity = (tab: Pick<TerminalTab, 'mode' | 'username' | 'host' | 'tmuxSession'>): string =>
  tab.mode === 'local' || !tab.username || !tab.host ? `tmux:${tab.tmuxSession}` : `${tab.username}@${tab.host}`;

const makeId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const now = (): string => new Date().toISOString();

const defaultConnections: Connection[] = [
  {
    id: makeId(),
    name: 'Local tmux (container)',
    mode: 'local',
    host: 'localhost',
    port: 22,
    username: 'local',
    authMode: 'password',
    tmuxSession: 'neuroterm',
    createdAt: now(),
    updatedAt: now(),
  },
];

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      connections: defaultConnections,
      tabs: [],
      activeTabId: null,
      viewMode: 'tabs',
      windowLayouts: {},
      focusedWindowKey: null,

      replaceConnections: (connections) => set({ connections }),

      addConnection: (input) => {
        const connection: Connection = { ...input, id: makeId(), createdAt: now(), updatedAt: now() };
        set((s) => ({ connections: [...s.connections, connection] }));
        return connection;
      },

      updateConnection: (id, input) => {
        let updated: Connection | null = null;
        set((s) => ({
          connections: s.connections.map((c) => {
            if (c.id !== id) return c;
            updated = { ...c, ...input, updatedAt: now() };
            return updated;
          }),
        }));
        return updated;
      },

      deleteConnection: (id) => {
        set((s) => {
          const orphanedTabs = s.tabs.filter((t) => t.connectionId === id);
          const windowLayouts = { ...s.windowLayouts };
          orphanedTabs.forEach((t) => { delete windowLayouts[windowKey(t)]; });
          return {
            connections: s.connections.filter((c) => c.id !== id),
            tabs: s.tabs.filter((t) => t.connectionId !== id),
            windowLayouts,
            activeTabId:
              s.activeTabId && s.tabs.some((t) => t.id === s.activeTabId && t.connectionId !== id)
                ? s.activeTabId
                : null,
          };
        });
      },

      openTab: (connection, sessionId) => {
        const existing = get().tabs.find(
          (t) => t.connectionId === connection.id && t.tmuxSession === connection.tmuxSession
        );
        if (existing) {
          set({ activeTabId: existing.id });
          return existing;
        }
        const tab: TerminalTab = {
          id: makeId(),
          sessionId,
          connectionId: connection.id,
          title: connection.name,
          mode: connection.mode,
          host: connection.host,
          port: connection.port,
          username: connection.username,
          tmuxSession: connection.tmuxSession,
          status: 'connecting',
          createdAt: now(),
        };
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
        return tab;
      },

      closeTab: (id) => {
        set((s) => {
          const remaining = s.tabs.filter((t) => t.id !== id);
          const nextActive =
            s.activeTabId === id
              ? (remaining[remaining.length - 1]?.id ?? null)
              : s.activeTabId;
          return { tabs: remaining, activeTabId: nextActive };
        });
      },

      setActiveTab: (id) => set({ activeTabId: id }),

      updateTabStatus: (id, status) =>
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, status } : t)),
        })),

      setViewMode: (mode) => set({ viewMode: mode }),

      setWindowLayout: (key, layout) =>
        set((s) => {
          const existing = s.windowLayouts[key];
          const topZ = Math.max(0, ...Object.values(s.windowLayouts).map((l) => l.zIndex));
          const base: WindowLayout = existing ?? { ...DEFAULT_LAYOUT, zIndex: topZ + 1 };
          return {
            windowLayouts: { ...s.windowLayouts, [key]: { ...base, ...layout } },
          };
        }),

      focusWindow: (key) =>
        set((s) => {
          const topZ = Math.max(0, ...Object.values(s.windowLayouts).map((l) => l.zIndex));
          if (s.focusedWindowKey === key && s.windowLayouts[key]?.zIndex === topZ) return s;
          const existing = s.windowLayouts[key] ?? { ...DEFAULT_LAYOUT, zIndex: topZ + 1 };
          return {
            focusedWindowKey: key,
            windowLayouts: { ...s.windowLayouts, [key]: { ...existing, zIndex: topZ + 1 } },
          };
        }),

      clearFocus: () => set({ focusedWindowKey: null }),

      removeWindowLayout: (key) =>
        set((s) => {
          const { [key]: _removed, ...rest } = s.windowLayouts;
          return { windowLayouts: rest };
        }),
    }),
    {
      name: 'neuroterm-session-store',
      partialize: (s) => ({ connections: s.connections, viewMode: s.viewMode, windowLayouts: s.windowLayouts }),
    }
  )
);
