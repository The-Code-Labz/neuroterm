import { useState, useEffect } from 'react';
import { Zap, Server, KeyRound, FileKey2 } from 'lucide-react';
import type { Connection, ConnectionInput, ConnectionMode, AuthMode } from '../../store/session-store';
import { api, type ApiCredential } from '../../lib/api';
import Sheet from '../ui/Sheet';
import Field from '../ui/Field';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Select from '../ui/Select';
import Button from '../ui/Button';
import SegmentedControl from '../ui/SegmentedControl';
import InlineAlert from '../ui/InlineAlert';

interface ConnectionFormModalProps {
  open: boolean;
  editTarget?: Connection | null;
  onClose: () => void;
  /** Async — the sheet stays open (disabled + spinner) until this resolves
   * or rejects, so a failed save surfaces its error in place instead of the
   * sheet closing and swallowing it. */
  onSave: (input: ConnectionInput) => Promise<void>;
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

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="pb-5 mb-5 border-b border-edge-subtle last:border-b-0 last:mb-0 last:pb-0 space-y-4">
      <h3 className="text-label text-ink-muted uppercase tracking-[0.06em]">{title}</h3>
      {children}
    </div>
  );
}

export default function ConnectionFormModal({ open, editTarget, onClose, onSave }: ConnectionFormModalProps): JSX.Element {
  const [form, setForm] = useState<ConnectionInput>(empty);
  const [credentials, setCredentials] = useState<ApiCredential[]>([]);
  const [useSaved, setUseSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      api.credentials.list().then(setCredentials).catch(() => setCredentials([]));
    }
  }, [open]);

  useEffect(() => {
    if (editTarget) {
      setForm({
        name: editTarget.name,
        mode: editTarget.mode,
        host: editTarget.host,
        port: editTarget.port,
        username: editTarget.username,
        authMode: editTarget.authMode,
        password: editTarget.password ?? '',
        privateKey: editTarget.privateKey ?? '',
        tmuxSession: editTarget.tmuxSession,
        credentialId: editTarget.credentialId,
      });
      setUseSaved(Boolean(editTarget.credentialId));
    } else {
      setForm(empty);
      setUseSaved(false);
    }
    setError(null);
  }, [editTarget, open]);

  const set = <K extends keyof ConnectionInput>(key: K, value: ConnectionInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleCredentialSelect = (credId: string) => {
    const cred = credentials.find((c) => c.id === credId);
    if (!cred) return;
    set('credentialId', credId);
    set('username', cred.username);
    set('authMode', cred.auth_type === 'private_key' ? 'privateKey' : 'password');
    if (cred.host) set('host', cred.host);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={editTarget ? 'Edit connection' : 'New connection'}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" form="connection-form" variant="primary" disabled={busy} className="flex-1">
            {busy ? 'Saving…' : editTarget ? 'Save changes' : 'Add connection'}
          </Button>
        </>
      }
    >
      <form id="connection-form" onSubmit={handleSubmit} noValidate>
        <Section title="Connection type">
          <SegmentedControl
            aria-label="Connection type"
            value={form.mode}
            onChange={(m: ConnectionMode) => set('mode', m)}
            options={[
              { value: 'local', label: 'Local tmux', icon: <Zap size={14} strokeWidth={1.75} /> },
              { value: 'ssh', label: 'SSH', icon: <Server size={14} strokeWidth={1.75} /> },
            ]}
          />
          <Field label="Connection name" required>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="My Server" required disabled={busy} />
          </Field>
        </Section>

        {form.mode === 'ssh' && (
          <Section title="Destination">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Host / IP" required>
                  <Input mono value={form.host} onChange={(e) => set('host', e.target.value)} placeholder="192.168.1.1" required disabled={busy} />
                </Field>
              </div>
              <Field label="Port">
                <Input
                  mono
                  type="number"
                  value={form.port}
                  onChange={(e) => set('port', Number(e.target.value))}
                  min={1}
                  max={65535}
                  disabled={busy}
                />
              </Field>
            </div>
            <Field label="Username" required>
              <Input mono value={form.username} onChange={(e) => set('username', e.target.value)} placeholder="ubuntu" required disabled={busy} />
            </Field>
          </Section>
        )}

        {form.mode === 'ssh' && (
          <Section title="Authentication">
            {credentials.length > 0 && (
              <label className="flex items-start gap-2.5 px-3 py-2.5 rounded-md bg-surface2 border border-edge-subtle cursor-pointer">
                <input
                  type="checkbox"
                  checked={useSaved}
                  onChange={(e) => {
                    setUseSaved(e.target.checked);
                    if (!e.target.checked) set('credentialId', undefined);
                  }}
                  disabled={busy}
                  className="mt-0.5 accent-accent"
                />
                <span>
                  <span className="block text-control text-ink">Use a saved credential</span>
                  <span className="block text-meta text-ink-muted mt-0.5">Reference an encrypted credential profile instead of entering auth here.</span>
                </span>
              </label>
            )}

            {useSaved ? (
              <>
                <Field label="Saved credential" required>
                  <Select
                    value={form.credentialId ?? ''}
                    onChange={(e) => handleCredentialSelect(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">— Select a credential —</option>
                    {credentials.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.username}{c.host ? ` @ ${c.host}` : ''})
                      </option>
                    ))}
                  </Select>
                </Field>
                {form.credentialId && (
                  <InlineAlert variant="info" message="Auth provided by the saved credential — encrypted on the server." />
                )}
              </>
            ) : (
              <>
                <SegmentedControl
                  aria-label="Auth method"
                  value={form.authMode}
                  onChange={(a: AuthMode) => set('authMode', a)}
                  options={[
                    { value: 'password', label: 'Password', icon: <KeyRound size={14} strokeWidth={1.75} /> },
                    { value: 'privateKey', label: 'Private key', icon: <FileKey2 size={14} strokeWidth={1.75} /> },
                  ]}
                />
                {form.authMode === 'password' ? (
                  <Field label="Password">
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={form.password ?? ''}
                      onChange={(e) => set('password', e.target.value)}
                      placeholder="••••••••"
                      disabled={busy}
                    />
                  </Field>
                ) : (
                  <Field label="Private key (PEM)" helper="Secrets are encrypted server-side before storage.">
                    <Textarea
                      value={form.privateKey ?? ''}
                      onChange={(e) => set('privateKey', e.target.value)}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      disabled={busy}
                    />
                  </Field>
                )}
              </>
            )}
          </Section>
        )}

        <Section title="Persistent session">
          <Field label="tmux session name" helper="Reconnects will attach to this same session.">
            <Input mono value={form.tmuxSession} onChange={(e) => set('tmuxSession', e.target.value)} placeholder="neuroterm" disabled={busy} />
          </Field>
        </Section>

        {error && <InlineAlert variant="error" message={error} />}
      </form>
    </Sheet>
  );
}
