import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import type { AuthState } from '../hooks/useAuth';
import Field from '../components/ui/Field';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import SegmentedControl from '../components/ui/SegmentedControl';
import InlineAlert from '../components/ui/InlineAlert';

interface LoginPageProps {
  auth: AuthState;
}

export default function LoginPage({ auth }: LoginPageProps): JSX.Element {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await auth.login(username, password);
      } else {
        await auth.register(username, password);
      }
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-dvh bg-canvas">
      {/* Left — brand (42%) */}
      <div className="hidden lg:flex lg:w-[42%] flex-col justify-center px-16 border-r border-edge-subtle bg-base">
        <div className="flex items-center gap-2 text-ink-strong font-sans font-semibold text-brand">
          <span className="text-accent font-technical">&gt;_</span> NeuroTerm
        </div>
        <p className="mt-6 text-body text-ink-secondary max-w-sm">
          Persistent tmux sessions that reconnect from any browser.
        </p>
        <div className="mt-10 flex items-center gap-3 font-technical text-meta-mono text-ink-muted">
          <span className="px-3 py-2 rounded-md bg-surface2 border border-edge-subtle text-ink-secondary">Browser</span>
          <ArrowRight size={14} className="text-ink-muted flex-shrink-0" />
          <span className="px-3 py-2 rounded-md bg-surface2 border border-edge-subtle text-ink-secondary">WebSocket</span>
          <ArrowRight size={14} className="text-ink-muted flex-shrink-0" />
          <span className="px-3 py-2 rounded-md bg-surface2 border border-edge-subtle text-ink-secondary">tmux</span>
        </div>
      </div>

      {/* Right — form (58%) */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden mb-8 text-center">
            <div className="flex items-center justify-center gap-2 text-ink-strong font-sans font-semibold text-page-title">
              <span className="text-accent font-technical">&gt;_</span> NeuroTerm
            </div>
            <p className="mt-1.5 text-meta text-ink-muted">Persistent tmux sessions that reconnect from any browser</p>
          </div>

          <h1 className="hidden lg:block text-page-title text-ink-strong mb-6">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </h1>

          <SegmentedControl
            aria-label="Sign in or register"
            value={mode}
            onChange={(m) => { setMode(m); setError(null); }}
            options={[
              { value: 'login', label: 'Sign In' },
              { value: 'register', label: 'Register' },
            ]}
          />

          <form onSubmit={handleSubmit} className="space-y-4 mt-6" noValidate>
            <Field label="Username" required>
              <Input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                placeholder="admin"
              />
            </Field>

            <Field label="Password" required>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-ink-muted hover:text-ink-secondary transition-colors duration-140"
                >
                  {showPassword ? <EyeOff size={15} strokeWidth={1.75} /> : <Eye size={15} strokeWidth={1.75} />}
                </button>
              </div>
            </Field>

            {error && <InlineAlert variant="error" message={error} />}

            <Button type="submit" variant="primary" disabled={busy} className="w-full">
              <span className="inline-block min-w-[7rem] text-center">
                {busy ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : mode === 'login' ? 'Sign In' : 'Create Account'}
              </span>
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
