import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Key, FileKey } from 'lucide-react';
import { api, type ApiCredential } from '../lib/api';
import CredentialFormModal from '../components/credentials/CredentialFormModal';

export default function CredentialsPage(): JSX.Element {
  const [credentials, setCredentials] = useState<ApiCredential[]>([]);
  const [loading, setLoading]         = useState(true);
  const [modalOpen, setModalOpen]     = useState(false);
  const [editTarget, setEditTarget]   = useState<ApiCredential | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.credentials.list()
      .then(setCredentials)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (cred: ApiCredential) => {
    if (!confirm(`Delete credential "${cred.name}"?`)) return;
    try {
      await api.credentials.delete(cred.id);
      setCredentials((prev) => prev.filter((c) => c.id !== cred.id));
    } catch (err) {
      alert(`Failed to delete: ${(err as Error).message}`);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-neuro-border">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-base font-mono text-gray-100 font-semibold">Saved Credentials</h1>
          <button
            onClick={() => { setEditTarget(null); setModalOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-neuro-cyan/10 border border-neuro-cyan/50 text-neuro-cyan text-xs font-mono hover:bg-neuro-cyan/20 transition-colors"
          >
            <Plus size={12} /> New
          </button>
        </div>
        <p className="text-xs font-mono text-gray-500">
          Reusable encrypted credentials — reference them when adding SSH connections
        </p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="text-center text-gray-600 font-mono text-xs py-8">Loading…</div>
        )}

        {!loading && credentials.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-gray-600 font-mono text-xs">
            <Key size={32} className="mb-3 opacity-40" />
            <p>No saved credentials yet</p>
            <p className="text-gray-700 mt-1">Add one to reuse across connections</p>
          </div>
        )}

        <div className="space-y-2">
          {credentials.map((cred) => (
            <div key={cred.id}
              className="group flex items-center gap-3 px-4 py-3 rounded border border-neuro-border bg-neuro-panel hover:border-neuro-cyan/30 transition-all"
            >
              <div className="flex-shrink-0 text-neuro-cyan">
                {cred.auth_type === 'password' ? <Key size={16} /> : <FileKey size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-mono text-gray-200">{cred.name}</div>
                <div className="text-xs font-mono text-gray-500">
                  {cred.username} · {cred.auth_type === 'password' ? '🔑 Password' : '📄 Private Key'}
                  {cred.has_passphrase && ' · passphrase set'}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => { setEditTarget(cred); setModalOpen(true); }}
                  className="p-1.5 rounded text-gray-500 hover:text-gray-300 hover:bg-neuro-bg transition-colors">
                  <Pencil size={12} />
                </button>
                <button onClick={() => handleDelete(cred)}
                  className="p-1.5 rounded text-gray-500 hover:text-neuro-red hover:bg-neuro-red/10 transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <CredentialFormModal
        open={modalOpen}
        editTarget={editTarget}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        onSaved={load}
      />
    </div>
  );
}
