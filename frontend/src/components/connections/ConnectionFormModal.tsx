import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Connection, ConnectionInput, ConnectionMode, AuthMode } from '../../store/session-store';

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
};

export default function ConnectionFormModal({ open, editTarget, onClose, onSave }: ConnectionFormModalProps): JSX.Element | null {
  const [form, setForm] = useState<ConnectionInput>(empty);

  useEffect(() => {
    if (editTarget) {
      setForm({
        name:        editTarget.name,
        mode:        editTarget.mode,
        host:        editTarget.host,
        port:        editTarget.port,
        username:    editTarget.username,
        authMode:    editTarget.authMode,
        password:    editTarget.password ?? '',
        privateKey:  editTarget.privateKey ?? '',
        tmuxSession: editTarget.tmuxSession,
      });
    } else {
      setForm(empty);
    }
  }, [editTarget, open]);

  if (!open) return null;

  const set = (key: keyof ConnectionInput, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-neuro-panel border border-neuro-border rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neuro-border">
          <h2 className="text-sm font-mono text-neuro-cyan font-semibold">
            {editTarget ? 'Edit Connection' : 'New Connection'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Mode */}
          <div className="flex gap-2">
            {(['local', 'ssh'] as ConnectionMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set('mode', m)}
                className={`flex-1 py-2 rounded text-xs font-mono border transition-colors ${
                  form.mode === m
                    ? 'bg-neuro-cyan/10 border-neuro-cyan text-neuro-cyan'
                    : 'border-neuro-border text-gray-400 hover:border-gray-500'
                }`}
              >
                {m === 'local' ? '⚡ Local tmux' : '🔗 SSH'}
              </button>
            ))}
          </div>

          <Field label="Name" required>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="My Server" required />
          </Field>

          {form.mode === 'ssh' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="Host" required>
                    <input value={form.host} onChange={(e) => set('host', e.target.value)} placeholder="192.168.1.1" required />
                  </Field>
                </div>
                <Field label="Port">
                  <input type="number" value={form.port} onChange={(e) => set('port', Number(e.target.value))} min={1} max={65535} />
                </Field>
              </div>

              <Field label="Username" required>
                <input value={form.username} onChange={(e) => set('username', e.target.value)} placeholder="ubuntu" required />
              </Field>

              {/* Auth method */}
              <div>
                <label className="block text-xs text-gray-400 font-mono mb-2">Auth Method</label>
                <div className="flex gap-2">
                  {(['password', 'privateKey'] as AuthMode[]).map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => set('authMode', a)}
                      className={`flex-1 py-1.5 rounded text-xs font-mono border transition-colors ${
                        form.authMode === a
                          ? 'bg-neuro-green/10 border-neuro-green text-neuro-green'
                          : 'border-neuro-border text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      {a === 'password' ? '🔑 Password' : '📄 Private Key'}
                    </button>
                  ))}
                </div>
              </div>

              {form.authMode === 'password' ? (
                <Field label="Password">
                  <input type="password" value={form.password ?? ''} onChange={(e) => set('password', e.target.value)} placeholder="••••••••" />
                </Field>
              ) : (
                <Field label="Private Key (PEM)">
                  <textarea
                    value={form.privateKey ?? ''}
                    onChange={(e) => set('privateKey', e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    rows={4}
                    className="resize-none"
                  />
                </Field>
              )}
            </>
          )}

          <Field label="tmux Session Name">
            <input value={form.tmuxSession} onChange={(e) => set('tmuxSession', e.target.value)} placeholder="neuroterm" />
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
      <div className="[&_input]:w-full [&_input]:bg-neuro-bg [&_input]:border [&_input]:border-neuro-border [&_input]:rounded [&_input]:px-3 [&_input]:py-2 [&_input]:text-xs [&_input]:font-mono [&_input]:text-gray-200 [&_input]:outline-none [&_input:focus]:border-neuro-cyan [&_textarea]:w-full [&_textarea]:bg-neuro-bg [&_textarea]:border [&_textarea]:border-neuro-border [&_textarea]:rounded [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:text-xs [&_textarea]:font-mono [&_textarea]:text-gray-200 [&_textarea]:outline-none [&_textarea:focus]:border-neuro-cyan">
        {children}
      </div>
    </div>
  );
}
