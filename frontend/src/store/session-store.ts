import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ConnectionMode  = 'ssh' | 'local';
export type AuthMode        = 'password' | 'privateKey';
export type TerminalStatus  = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

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

  replaceConnections: (connections: Connection[]) => void;
  addConnection: (input: ConnectionInput) => Connection;
  updateConnection: (id: string, input: ConnectionInput) => Connection | null;
  deleteConnection: (id: string) => void;

  openTab: (connection: Connection, sessionId: string) => TerminalTab;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabStatus: (id: string, status: TerminalStatus) => void;
}

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
        set((s) => ({
          connections: s.connections.filter((c) => c.id !== id),
          tabs: s.tabs.filter((t) => t.connectionId !== id),
          activeTabId:
            s.activeTabId && s.tabs.some((t) => t.id === s.activeTabId && t.connectionId !== id)
              ? s.activeTabId
              : null,
        }));
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
    }),
    {
      name: 'neuroterm-session-store',
      partialize: (s) => ({ connections: s.connections }),
    }
  )
);
