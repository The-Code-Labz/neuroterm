import { useState } from 'react';
import { Plus, Terminal, Pencil, Trash2, Zap, Server } from 'lucide-react';
import { useSessionStore, type Connection } from '../../store/session-store';
import ConnectionFormModal from './ConnectionFormModal';
import { api } from '../../lib/api';
import { useNavigate } from 'react-router-dom';

export default function ConnectionList(): JSX.Element {
  const { connections, addConnection, updateConnection, deleteConnection, openTab } = useSessionStore();
  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState<Connection | null>(null);
  const [loading, setLoading]       = useState<string | null>(null);
  const navigate = useNavigate();

  const handleConnect = async (conn: Connection) => {
    setLoading(conn.id);
    try {
      const session = await api.sessions.create({
        name: conn.name,
        tmux_session: conn.tmuxSession,
        mode: conn.mode,
        // Local sessions have no DB-backed connection_id — only SSH sessions do
        connection_id: conn.mode === 'local' ? undefined : conn.id,
        cols: 220,
        rows: 50,
      });
      openTab(conn, session.id);
      navigate('/terminal');
    } catch (err) {
      console.error('Failed to create session', err);
      alert(`Failed to connect: ${(err as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleSave = (input: Parameters<typeof addConnection>[0]) => {
    if (editTarget) {
      updateConnection(editTarget.id, input);
    } else {
      addConnection(input);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this connection?')) deleteConnection(id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neuro-border">
        <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">Connections</span>
        <button
          onClick={() => { setEditTarget(null); setModalOpen(true); }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-neuro-cyan/10 border border-neuro-cyan/50 text-neuro-cyan text-xs font-mono hover:bg-neuro-cyan/20 transition-colors"
        >
          <Plus size={12} />
          New
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {connections.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-gray-600 text-xs font-mono">
            <Terminal size={24} className="mb-2 opacity-50" />
            <span>No connections yet</span>
          </div>
        )}

        {connections.map((conn) => (
          <div
            key={conn.id}
            className="group flex items-center gap-3 px-3 py-2.5 rounded border border-transparent hover:border-neuro-border hover:bg-neuro-panel transition-all"
          >
            <div className="flex-shrink-0 text-neuro-green">
              {conn.mode === 'local' ? <Zap size={16} /> : <Server size={16} />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-mono text-gray-200 truncate">{conn.name}</div>
              <div className="text-xs font-mono text-gray-500 truncate">
                {conn.mode === 'local' ? 'local container' : `${conn.username}@${conn.host}:${conn.port}`}
                <span className="ml-2 text-neuro-green/60">[{conn.tmuxSession}]</span>
              </div>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => { setEditTarget(conn); setModalOpen(true); }}
                className="p-1.5 rounded text-gray-500 hover:text-gray-300 hover:bg-neuro-bg transition-colors"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={() => handleDelete(conn.id)}
                className="p-1.5 rounded text-gray-500 hover:text-neuro-red hover:bg-neuro-red/10 transition-colors"
              >
                <Trash2 size={12} />
              </button>
              <button
                onClick={() => handleConnect(conn)}
                disabled={loading === conn.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neuro-green/10 border border-neuro-green/50 text-neuro-green text-xs font-mono hover:bg-neuro-green/20 transition-colors disabled:opacity-50"
              >
                <Terminal size={11} />
                {loading === conn.id ? 'Opening...' : 'Connect'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConnectionFormModal
        open={modalOpen}
        editTarget={editTarget}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        onSave={handleSave}
      />
    </div>
  );
}
