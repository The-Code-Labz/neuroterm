import { Navigate } from 'react-router-dom';
import type { ApiUser } from '../../lib/api';

interface ProtectedRouteProps {
  user: ApiUser | null;
  loading: boolean;
  children: React.ReactNode;
}

export default function ProtectedRoute({ user, loading, children }: ProtectedRouteProps): JSX.Element {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neuro-bg">
        <span className="text-neuro-cyan font-mono text-sm animate-pulse">Authenticating…</span>
      </div>
    );
  }

  // If static token is configured AND no JWT user, still allow access (backwards compat)
  const hasStaticToken = Boolean(import.meta.env.VITE_AUTH_TOKEN);
  if (!user && !hasStaticToken) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
