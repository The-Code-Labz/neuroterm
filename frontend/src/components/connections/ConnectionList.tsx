import { useMemo, useState } from 'react';
import { Plus, Terminal, Pencil, Trash2, Zap, Server, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore, type Connection, type ConnectionInput } from '../../store/session-store';
import ConnectionFormModal from './ConnectionFormModal';
import { api } from '../../lib/api';
import { announce } from '../../store/live-region-store';
import Button from '../ui/Button';
import Menu from '../ui/Menu';
import InventoryRow from '../ui/InventoryRow';
import EmptyState from '../ui/EmptyState';
import InlineAlert from '../ui/InlineAlert';
import ConfirmDialog from '../ui/ConfirmDialog';
import Input from '../ui/Input';

const SEARCH_THRESHOLD = 7;

export default function ConnectionList(): JSX.Element {
  const { connections, addConnection, updateConnection, deleteConnection, openTab } = useSessionStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Connection | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    if (!query.trim()) return connections;
    const q = query.toLowerCase();
    return connections.filter(
      (c) => c.name.toLowerCase().includes(q) || c.host.toLowerCase().includes(q) || c.username.toLowerCase().includes(q)
    );
  }, [connections, query]);

  const handleConnect = async (conn: Connection) => {
    setConnectingId(conn.id);
    setActionError(null);
    try {
      const session = await api.sessions.create({
        name: conn.name,
        tmux_session: conn.tmuxSession,
        mode: conn.mode,
        connection_id: conn.mode === 'local' ? undefined : (conn.backendId ?? undefined),
        cols: 220,
        rows: 50,
      });
      openTab(conn, session.id);
      announce(`Connecting to ${conn.name}`);
      navigate('/terminal');
    } catch (err) {
      const message = (err as Error).message;
      setActionError(`Failed to connect to ${conn.name}: ${message}`);
      announce(`Failed to connect to ${conn.name}`);
    } finally {
      setConnectingId(null);
    }
  };

  const handleSave = async (input: ConnectionInput) => {
    if (input.mode === 'ssh') {
      const payload = {
        name: input.name,
        host: input.host,
        port: input.port,
        username: input.username,
        auth_type: (input.authMode === 'password' ? 'password' : 'private_key') as 'password' | 'private_key',
        password: input.credentialId ? undefined : input.password,
        private_key: input.credentialId ? undefined : input.privateKey,
        credential_id: input.credentialId ?? undefined,
        tmux_session: input.tmuxSession,
        mode: 'ssh' as const,
      };
      if (editTarget?.backendId) {
        await api.connections.update(editTarget.backendId, payload);
        updateConnection(editTarget.id, { ...input, backendId: editTarget.backendId });
      } else {
        const created = await api.connections.create(payload);
        if (editTarget) {
          updateConnection(editTarget.id, { ...input, backendId: created.id });
        } else {
          addConnection({ ...input, backendId: created.id });
        }
      }
    } else if (editTarget) {
      updateConnection(editTarget.id, input);
    } else {
      addConnection(input);
    }
    announce(editTarget ? `Saved changes to ${input.name}` : `Added connection ${input.name}`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    try {
      if (deleteTarget.mode === 'ssh' && deleteTarget.backendId) {
        await api.connections.delete(deleteTarget.backendId);
      }
      deleteConnection(deleteTarget.id);
      announce(`Deleted connection ${deleteTarget.name}`);
      setDeleteTarget(null);
    } catch (err) {
      setActionError(`Failed to delete ${deleteTarget.name}: ${(err as Error).message}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-edge-subtle">
        <div className="flex-1 min-w-0">
          <h1 className="text-page-title text-ink-strong">SSH Connections</h1>
          <p className="mt-0.5 text-meta text-ink-muted">All sessions use tmux — disconnect and reconnect without losing state</p>
        </div>
        <Button variant="primary" onClick={() => { setEditTarget(null); setModalOpen(true); }}>
          <Plus size={16} strokeWidth={1.75} />
          New connection
        </Button>
      </div>

      {connections.length > SEARCH_THRESHOLD && (
        <div className="px-5 pt-4">
          <div className="relative max-w-xs">
            <Search size={14} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search connections…" className="pl-9" aria-label="Search connections" />
          </div>
        </div>
      )}

      {actionError && (
        <div className="px-5 pt-4">
          <InlineAlert variant="error" message={actionError} />
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {connections.length === 0 && (
          <EmptyState
            icon={<Terminal size={32} strokeWidth={1.5} />}
            title="No connections yet"
            description="Add a local tmux session or an SSH host to get started."
            action={
              <Button variant="primary" onClick={() => { setEditTarget(null); setModalOpen(true); }}>
                <Plus size={16} strokeWidth={1.75} /> New connection
              </Button>
            }
          />
        )}

        {connections.length > 0 && filtered.length === 0 && (
          <EmptyState icon={<Search size={32} strokeWidth={1.5} />} title="No matches" description={`No connections match “${query}”.`} />
        )}

        <div className="mx-5 rounded-lg bg-surface1 border border-edge-subtle overflow-hidden">
          {filtered.map((conn) => (
            <InventoryRow
              key={conn.id}
              glyph={conn.mode === 'local' ? <Zap size={16} strokeWidth={1.75} /> : <Server size={16} strokeWidth={1.75} />}
              title={conn.name}
              meta={
                <>
                  <span className="inline-flex items-center gap-1">
                    {conn.mode === 'local' ? <Zap size={11} strokeWidth={1.75} /> : <Server size={11} strokeWidth={1.75} />}
                    {conn.mode === 'local' ? 'Local' : 'SSH'}
                  </span>
                  <span className="font-technical">
                    {conn.mode === 'local' ? 'local container' : `${conn.username}@${conn.host}:${conn.port}`}
                  </span>
                  <span className="font-technical text-ink-muted">[{conn.tmuxSession}]</span>
                </>
              }
              actions={
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleConnect(conn)}
                    disabled={connectingId === conn.id}
                  >
                    <Terminal size={13} strokeWidth={1.75} />
                    {connectingId === conn.id ? 'Opening…' : 'Connect'}
                  </Button>
                  <Menu
                    label={`More actions for ${conn.name}`}
                    items={[
                      { label: 'Edit', icon: <Pencil size={14} strokeWidth={1.75} />, onSelect: () => { setEditTarget(conn); setModalOpen(true); } },
                      { label: 'Delete', icon: <Trash2 size={14} strokeWidth={1.75} />, danger: true, onSelect: () => setDeleteTarget(conn) },
                    ]}
                  />
                </>
              }
            />
          ))}
        </div>
      </div>

      <ConnectionFormModal
        open={modalOpen}
        editTarget={editTarget}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete connection?"
        description={deleteTarget ? `“${deleteTarget.name}” will be permanently removed. This can’t be undone.` : ''}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
