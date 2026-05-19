import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import AppShell from './components/common/AppShell';
import ProtectedRoute from './components/common/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import ConnectionsPage from './pages/ConnectionsPage';
import CredentialsPage from './pages/CredentialsPage';
import TerminalPage from './pages/TerminalPage';

export default function App(): JSX.Element {
  const auth = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage auth={auth} />} />

        {/* Protected */}
        <Route
          path="/*"
          element={
            <ProtectedRoute user={auth.user} loading={auth.loading}>
              <AppShell user={auth.user} onLogout={auth.logout}>
                <Routes>
                  <Route path="/"            element={<ConnectionsPage />} />
                  <Route path="/credentials" element={<CredentialsPage />} />
                  <Route path="/terminal"    element={<TerminalPage />} />
                  <Route path="*"            element={<Navigate to="/" replace />} />
                </Routes>
              </AppShell>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
