import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AuthState } from '../hooks/useAuth';

interface LoginPageProps {
  auth: AuthState;
}

export default function LoginPage({ auth }: LoginPageProps): JSX.Element {
  const navigate = useNavigate();
  const [mode, setMode]         = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);

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
    <div className="flex items-center justify-center min-h-screen bg-neuro-bg">
      <div className="w-full max-w-sm bg-neuro-panel border border-neuro-border rounded-lg shadow-2xl p-8">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="text-neuro-cyan font-mono text-xl font-bold tracking-tight">
            &gt;_ NeuroTerm
          </div>
          <div className="text-gray-500 font-mono text-xs mt-1">tmux session manager</div>
        </div>

        {/* Toggle */}
        <div className="flex rounded overflow-hidden border border-neuro-border mb-6">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); }}
              className={`flex-1 py-2 text-xs font-mono transition-colors ${
                mode === m
                  ? 'bg-neuro-cyan/10 text-neuro-cyan border-r border-neuro-border'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-gray-400 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full bg-neuro-bg border border-neuro-border rounded px-3 py-2 text-sm font-mono text-gray-200 outline-none focus:border-neuro-cyan transition-colors"
              placeholder="admin"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-neuro-bg border border-neuro-border rounded px-3 py-2 text-sm font-mono text-gray-200 outline-none focus:border-neuro-cyan transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-neuro-red text-xs font-mono bg-neuro-red/10 border border-neuro-red/30 rounded px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded bg-neuro-cyan/10 border border-neuro-cyan text-neuro-cyan text-sm font-mono hover:bg-neuro-cyan/20 transition-colors disabled:opacity-50"
          >
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
