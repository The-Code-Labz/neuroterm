import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Key, FileKey, Lock } from 'lucide-react';
import { api, type ApiCredential } from '../lib/api';
import { announce } from '../store/live-region-store';
import CredentialFormModal from '../components/credentials/CredentialFormModal';
import Button from '../components/ui/Button';
import Menu from '../components/ui/Menu';
import InventoryRow from '../components/ui/InventoryRow';
import EmptyState from '../components/ui/EmptyState';
import InlineAlert from '../components/ui/InlineAlert';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { SkeletonRows } from '../components/ui/SkeletonRow';

export default function CredentialsPage(): JSX.Element {
  const [credentials, setCredentials] = useState<ApiCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiCredential | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiCredential | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    api.credentials.list()
      .then(setCredentials)
      .catch((err) => setLoadError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.credentials.delete(deleteTarget.id);
      setCredentials((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      announce(`Deleted credential ${deleteTarget.name}`);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-canvas">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-edge-subtle">
        <div className="flex-1 min-w-0">
          <h1 className="text-page-title text-ink-strong">Saved Credentials</h1>
          <p className="mt-0.5 text-meta text-ink-muted">Reusable encrypted credentials — reference them when adding SSH connections</p>
        </div>
        <Button variant="primary" onClick={() => { setEditTarget(null); setModalOpen(true); }}>
          <Plus size={16} strokeWidth={1.75} /> New credential
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loadError && (
          <div className="px-5 pt-4">
            <InlineAlert variant="error" message={`Failed to load credentials: ${loadError}`} onRetry={load} />
          </div>
        )}

        {deleteError && (
          <div className="px-5 pt-4">
            <InlineAlert variant="error" message={deleteError} />
          </div>
        )}

        {loading && (
          <div className="mx-5 mt-4 rounded-lg bg-surface1 border border-edge-subtle overflow-hidden">
            <SkeletonRows count={4} />
          </div>
        )}

        {!loading && !loadError && credentials.length === 0 && (
          <EmptyState
            icon={<Key size={32} strokeWidth={1.5} />}
            title="No saved credentials yet"
            description="Add one to reuse across connections."
            action={
              <Button variant="primary" onClick={() => { setEditTarget(null); setModalOpen(true); }}>
                <Plus size={16} strokeWidth={1.75} /> New credential
              </Button>
            }
          />
        )}

        {!loading && credentials.length > 0 && (
          <div className="mx-5 mt-4 rounded-lg bg-surface1 border border-edge-subtle overflow-hidden">
            {credentials.map((cred) => (
              <InventoryRow
                key={cred.id}
                glyph={cred.auth_type === 'password' ? <Key size={16} strokeWidth={1.75} /> : <FileKey size={16} strokeWidth={1.75} />}
                title={cred.name}
                meta={
                  <>
                    <span className="font-technical">{cred.username}</span>
                    <span className="inline-flex items-center gap-1">
                      <Lock size={11} strokeWidth={1.75} />
                      {cred.auth_type === 'password' ? 'Password' : 'Private key'}
                    </span>
                    {cred.has_passphrase && <span>passphrase set</span>}
                  </>
                }
                actions={
                  <Menu
                    label={`More actions for ${cred.name}`}
                    items={[
                      { label: 'Edit', icon: <Pencil size={14} strokeWidth={1.75} />, onSelect: () => { setEditTarget(cred); setModalOpen(true); } },
                      { label: 'Delete', icon: <Trash2 size={14} strokeWidth={1.75} />, danger: true, onSelect: () => setDeleteTarget(cred) },
                    ]}
                  />
                }
              />
            ))}
          </div>
        )}
      </div>

      <CredentialFormModal
        open={modalOpen}
        editTarget={editTarget}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        onSaved={load}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete credential?"
        description={deleteTarget ? `“${deleteTarget.name}” will be permanently removed. This can’t be undone.` : ''}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
