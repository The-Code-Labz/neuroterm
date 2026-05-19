import { useState, useEffect } from 'react';
import { X, ChevronDown } from 'lucide-react';
import type { Connection, ConnectionInput, ConnectionMode, AuthMode } from '../../store/session-store';
import { api, type ApiCredential } from '../../lib/api';

interface ConnectionFormModalProps {
  open: boolean;
  editTarget?: Connection | null;
  onClose: () => void;
  onSave: (input: ConnectionInput) => void;
}

const empty: ConnectionInput = {
  name: '',
  mode: 'ssh',
  host: '',
  port: 22,
  username: '',
  authMode: 'password',
  password: '',
  privateKey: '',
  tmuxSession: 'neuroterm',
  credentialId: undefined,
};

export default function ConnectionFormModal({ open, editTarget, onClose, onSave }: ConnectionFormModalProps): JSX.Element | null {
  const [form, setForm]               = useState<ConnectionInput>(empty);
  const [credentials, setCredentials] = useState<ApiCredential[]>([]);
  const [useSaved, setUseSaved]       = useState(false);

  // Load saved credentials when modal opens
  useEffect(() => {
    if (open) {
      api.credentials.list().then(setCredentials).catch(() => setCredentials([]));
    }
  }, [open]);

  useEffect(() => {
    if (editTarget) {
      setForm({
        name:         editTarget.name,
        mode:         editTarget.mode,
        host:         editTarget.host,
        port:         editTarget.port,
        username:     editTarget.username,
        authMode:     editTarget.authMode,
        password:     editTarget.password ?? '',
        privateKey:   editTarget.privateKey ?? '',
        tmuxSession:  editTarget.tmuxSession,
        credentialId: editTarget.credentialId,
      });
      setUseSaved(Boolean(editTarget.credentialId));
    } else {
      setForm(empty);
      setUseSaved(false);
    }
  }, [editTarget, open]);

  if (!open) return null;

  const set = (key: keyof ConnectionInput, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  // When a saved credential is selected — pre-fill host/username from it
  const handleCredentialSelect = (credId: string) => {
    const cred = credentials.find((c) => c.id === credId);
    if (!cred) return;
    set('credentialId', credId);
    set('username', cred.username);
    set('authMode', cred.auth_type === 'private_key' ? 'privateKey' : 'password');
    if (cred.host) set('host', cred.host);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-neuro-panel border border-neuro-border rounded-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neuro-border sticky top-0 bg-neuro-panel">
          <h2 className="text-sm font-mono text-neuro-cyan font-semibold">
            {editTarget ? 'Edit Connection' : 'New Connection'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Mode */}
          <div className="flex gap-2">
            {(['local', 'ssh'] as ConnectionMode[]).map((m) => (
              <button key={m} type="button" onClick={() => set('mode', m)}
                className={`flex-1 py-2 rounded text-xs font-mono border transition-colors ${
                  form.mode === m
                    ? 'bg-neuro-cyan/10 border-neuro-cyan text-neuro-cyan'
                    : 'border-neuro-border text-gray-400 hover:border-gray-500'
                }`}>
                {m === 'local' ? '⚡ Local tmux' : '🔗 SSH'}
              </button>
            ))}
          </div>

          <Field label="Connection Name" required>
            <input value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder="My Server" required />
          </Field>

          {form.mode === 'ssh' && (
            <>
              {/* Saved credential selector */}
              {credentials.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <button type="button" onClick={() => {
                      setUseSaved(!useSaved);
                      if (useSaved) {
                        set('credentialId', undefined);
                      }
                    }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono border transition-colors ${
                        useSaved
                          ? 'bg-neuro-green/10 border-neuro-green text-neuro-green'
                          : 'border-neuro-border text-gray-400 hover:border-gray-500'
                      }`}>
                      🔐 {useSaved ? 'Using saved credential' : 'Use saved credential'}
                    </button>
                  </div>

                  {useSaved && (
                    <div className="relative">
                      <select
                        value={form.credentialId ?? ''}
                        onChange={(e) => handleCredentialSelect(e.target.value)}
                        className="w-full bg-neuro-bg border border-neuro-border rounded px-3 py-2 text-xs font-mono text-gray-200 outline-none focus:border-neuro-cyan appearance-none"
                      >
                        <option value="">— Select a credential —</option>
                        {credentials.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.username}{c.host ? ` @ ${c.host}` : ''})
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    </div>
                  )}
                </div>
              )}

              {/* Host + Port */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="Host / IP" required>
                    <input value={form.host} onChange={(e) => set('host', e.target.value)}
                      placeholder="192.168.1.1" required />
                  </Field>
                </div>
                <Field label="Port">
                  <input type="number" value={form.port}
                    onChange={(e) => set('port', Number(e.target.value))} min={1} max={65535} />
                </Field>
              </div>

              {/* Username — pre-filled from credential but still editable */}
              <Field label="Username" required>
                <input value={form.username} onChange={(e) => set('username', e.target.value)}
                  placeholder="ubuntu" required />
              </Field>

              {/* Auth — hidden if using saved credential */}
              {!useSaved && (
                <>
                  <div>
                    <label className="block text-xs text-gray-400 font-mono mb-2">Auth Method</label>
                    <div className="flex gap-2">
                      {(['password', 'privateKey'] as AuthMode[]).map((a) => (
                        <button key={a} type="button" onClick={() => set('authMode', a)}
                          className={`flex-1 py-1.5 rounded text-xs font-mono border transition-colors ${
                            form.authMode === a
                              ? 'bg-neuro-green/10 border-neuro-green text-neuro-green'
                              : 'border-neuro-border text-gray-400 hover:border-gray-500'
                          }`}>
                          {a === 'password' ? '🔑 Password' : '📄 Private Key'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {form.authMode === 'password' ? (
                    <Field label="Password">
                      <input type="password" value={form.password ?? ''}
                        onChange={(e) => set('password', e.target.value)} placeholder="••••••••" />
                    </Field>
                  ) : (
                    <Field label="Private Key (PEM)">
                      <textarea value={form.privateKey ?? ''}
                        onChange={(e) => set('privateKey', e.target.value)}
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                        rows={4} className="resize-none" />
                    </Field>
                  )}
                </>
              )}

              {useSaved && form.credentialId && (
                <div className="flex items-center gap-2 px-3 py-2 rounded bg-neuro-green/5 border border-neuro-green/20 text-xs font-mono text-neuro-green">
                  ✓ Auth provided by saved credential — encrypted on server
                </div>
              )}
            </>
          )}

          <Field label="tmux Session Name">
            <input value={form.tmuxSession} onChange={(e) => set('tmuxSession', e.target.value)}
              placeholder="neuroterm" />
          </Field>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded border border-neuro-border text-gray-400 text-xs font-mono hover:border-gray-500 transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 py-2 rounded bg-neuro-cyan/10 border border-neuro-cyan text-neuro-cyan text-xs font-mono hover:bg-neuro-cyan/20 transition-colors">
              {editTarget ? 'Save Changes' : 'Add Connection'}
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
      <div className="[&_input]:w-full [&_input]:bg-neuro-bg [&_input]:border [&_input]:border-neuro-border [&_input]:rounded [&_input]:px-3 [&_input]:py-2 [&_input]:text-xs [&_input]:font-mono [&_input]:text-gray-200 [&_input]:outline-none [&_input:focus]:border-neuro-cyan [&_textarea]:w-full [&_textarea]:bg-neuro-bg [&_textarea]:border [&_textarea]:border-neuro-border [&_textarea]:rounded [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:text-xs [&_textarea]:font-mono [&_textarea]:text-gray-200 [&_textarea]:outline-none [&_textarea:focus]:border-neuro-cyan [&_select]:w-full [&_select]:bg-neuro-bg [&_select]:border [&_select]:border-neuro-border [&_select]:rounded [&_select]:px-3 [&_select]:py-2 [&_select]:text-xs [&_select]:font-mono [&_select]:text-gray-200 [&_select]:outline-none [&_select:focus]:border-neuro-cyan">
        {children}
      </div>
    </div>
  );
}
