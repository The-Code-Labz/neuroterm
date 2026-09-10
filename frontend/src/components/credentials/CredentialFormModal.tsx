import { useState, useEffect } from 'react';
import { KeyRound, FileKey2 } from 'lucide-react';
import { api, type ApiCredential, type CreateCredentialPayload } from '../../lib/api';
import { announce } from '../../store/live-region-store';
import Sheet from '../ui/Sheet';
import Field from '../ui/Field';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import SegmentedControl from '../ui/SegmentedControl';
import InlineAlert from '../ui/InlineAlert';

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

export default function CredentialFormModal({ open, editTarget, onClose, onSaved }: CredentialFormModalProps): JSX.Element {
  const [form, setForm] = useState<CreateCredentialPayload>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editTarget) {
      setForm({
        name: editTarget.name,
        host: editTarget.host ?? '',
        username: editTarget.username,
        auth_type: editTarget.auth_type,
        password: '',
        private_key: '',
        passphrase: '',
      });
    } else {
      setForm(empty);
    }
    setError(null);
  }, [editTarget, open]);

  const set = (key: keyof CreateCredentialPayload, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editTarget) {
        await api.credentials.update(editTarget.id, form);
        announce(`Saved changes to ${form.name}`);
      } else {
        await api.credentials.create(form);
        announce(`Added credential ${form.name}`);
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
    <Sheet
      open={open}
      title={editTarget ? 'Edit credential' : 'New credential'}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" form="credential-form" variant="primary" disabled={busy} className="flex-1">
            {busy ? 'Saving…' : editTarget ? 'Save changes' : 'Add credential'}
          </Button>
        </>
      }
    >
      <form id="credential-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Profile name" required>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="My Server Root" required disabled={busy} />
        </Field>

        <Field label="Host / IP" helper="Optional — pre-fills when creating connections.">
          <Input mono value={form.host ?? ''} onChange={(e) => set('host', e.target.value)} placeholder="192.168.1.1 or server.example.com" disabled={busy} />
        </Field>

        <Field label="Username" required>
          <Input mono value={form.username} onChange={(e) => set('username', e.target.value)} placeholder="root" required disabled={busy} />
        </Field>

        <SegmentedControl
          aria-label="Auth type"
          value={form.auth_type}
          onChange={(a) => set('auth_type', a)}
          options={[
            { value: 'password', label: 'Password', icon: <KeyRound size={14} strokeWidth={1.75} /> },
            { value: 'private_key', label: 'Private key', icon: <FileKey2 size={14} strokeWidth={1.75} /> },
          ]}
        />

        {form.auth_type === 'password' ? (
          <Field label={editTarget ? 'New password (leave blank to keep current)' : 'Password'} required={!editTarget}>
            <Input
              type="password"
              autoComplete="new-password"
              value={form.password ?? ''}
              onChange={(e) => set('password', e.target.value)}
              placeholder="••••••••"
              required={!editTarget}
              disabled={busy}
            />
          </Field>
        ) : (
          <>
            <Field
              label={editTarget ? 'New private key (leave blank to keep current)' : 'Private key (PEM)'}
              required={!editTarget}
              helper="Secrets are encrypted server-side before storage."
            >
              <Textarea
                value={form.private_key ?? ''}
                onChange={(e) => set('private_key', e.target.value)}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                required={!editTarget}
                disabled={busy}
              />
            </Field>
            <Field label="Passphrase (optional)">
              <Input
                type="password"
                autoComplete="new-password"
                value={form.passphrase ?? ''}
                onChange={(e) => set('passphrase', e.target.value)}
                placeholder="(none)"
                disabled={busy}
              />
            </Field>
          </>
        )}

        {error && <InlineAlert variant="error" message={error} />}
      </form>
    </Sheet>
  );
}
