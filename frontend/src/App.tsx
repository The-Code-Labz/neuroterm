import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/common/AppShell';
import ConnectionsPage from './pages/ConnectionsPage';
import TerminalPage from './pages/TerminalPage';

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<ConnectionsPage />} />
          <Route path="/terminal" element={<TerminalPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
