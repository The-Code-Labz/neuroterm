import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { api, type ApiCredential, type CreateCredentialPayload } from '../../lib/api';

interface CredentialFormModalProps {
  open: boolean;
  editTarget?: ApiCredential | null;
  onClose: () => void;
  onSaved: () => void;
}

const empty: CreateCredentialPayload = {
  name: '',
  host: '',
  username: '',
  auth_type: 'password',
  password: '',
  private_key: '',
  passphrase: '',
};

export default function CredentialFormModal({ open, editTarget, onClose, onSaved }: CredentialFormModalProps): JSX.Element | null {
  const [form, setForm] = useState<CreateCredentialPayload>(empty);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editTarget) {
      setForm({
        name:        editTarget.name,
        host:        editTarget.host ?? '',
        username:    editTarget.username,
        auth_type:   editTarget.auth_type,
        password:    '',
        private_key: '',
        passphrase:  '',
      });
    } else {
      setForm(empty);
    }
    setError(null);
  }, [editTarget, open]);

  if (!open) return null;

  const set = (key: keyof CreateCredentialPayload, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editTarget) {
        await api.credentials.update(editTarget.id, form);
      } else {
        await api.credentials.create(form);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-neuro-panel border border-neuro-border rounded-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neuro-border">
          <h2 className="text-sm font-mono text-neuro-cyan font-semibold">
            {editTarget ? 'Edit Credential' : 'New Credential'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <Field label="Profile Name" required>
            <input value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder="My Server Root" required />
          </Field>

          <Field label="Host / IP (optional — pre-fills when creating connections)">
            <input value={form.host ?? ''} onChange={(e) => set('host', e.target.value)}
              placeholder="192.168.1.1 or server.example.com" />
          </Field>

          <Field label="Username" required>
            <input value={form.username} onChange={(e) => set('username', e.target.value)}
              placeholder="root" required />
          </Field>

          {/* Auth type toggle */}
          <div className="flex gap-2">
            {(['password', 'private_key'] as const).map((a) => (
              <button key={a} type="button" onClick={() => set('auth_type', a)}
                className={`flex-1 py-2 rounded text-xs font-mono border transition-colors ${
                  form.auth_type === a
                    ? 'bg-neuro-green/10 border-neuro-green text-neuro-green'
                    : 'border-neuro-border text-gray-400 hover:border-gray-500'
                }`}>
                {a === 'password' ? '🔑 Password' : '📄 Private Key'}
              </button>
            ))}
          </div>

          {form.auth_type === 'password' ? (
            <Field label={editTarget ? 'New Password (leave blank to keep current)' : 'Password'} required={!editTarget}>
              <input type="password" value={form.password ?? ''}
                onChange={(e) => set('password', e.target.value)}
                placeholder="••••••••" required={!editTarget} />
            </Field>
          ) : (
            <>
              <Field label={editTarget ? 'New Private Key (leave blank to keep current)' : 'Private Key (PEM)'} required={!editTarget}>
                <textarea value={form.private_key ?? ''}
                  onChange={(e) => set('private_key', e.target.value)}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  rows={5} className="resize-none" required={!editTarget} />
              </Field>
              <Field label="Passphrase (optional)">
                <input type="password" value={form.passphrase ?? ''}
                  onChange={(e) => set('passphrase', e.target.value)} placeholder="(none)" />
              </Field>
            </>
          )}

          {error && (
            <div className="text-neuro-red text-xs font-mono bg-neuro-red/10 border border-neuro-red/30 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded border border-neuro-border text-gray-400 text-xs font-mono hover:border-gray-500 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="flex-1 py-2 rounded bg-neuro-cyan/10 border border-neuro-cyan text-neuro-cyan text-xs font-mono hover:bg-neuro-cyan/20 transition-colors disabled:opacity-50">
              {busy ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Credential'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <label className="block text-xs text-gray-400 font-mono mb-1">
        {label}{required && <span className="text-neuro-red ml-1">*</span>}
      </label>
      <div className="[&_input]:w-full [&_input]:bg-neuro-bg [&_input]:border [&_input]:border-neuro-border [&_input]:rounded [&_input]:px-3 [&_input]:py-2 [&_input]:text-xs [&_input]:font-mono [&_input]:text-gray-200 [&_input]:outline-none [&_input:focus]:border-neuro-cyan [&_textarea]:w-full [&_textarea]:bg-neuro-bg [&_textarea]:border [&_textarea]:border-neuro-border [&_textarea]:rounded [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:text-xs [&_textarea]:font-mono [&_textarea]:text-gray-200 [&_textarea]:outline-none [&_textarea:focus]:border-neuro-cyan">
        {children}
      </div>
    </div>
  );
}
