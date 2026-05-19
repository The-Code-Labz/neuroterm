import { NavLink } from 'react-router-dom';
import { Server, Terminal, Key, LogOut, User } from 'lucide-react';
import type { ApiUser } from '../../lib/api';

interface AppShellProps {
  children: React.ReactNode;
  user?: ApiUser | null;
  onLogout?: () => void;
}

const navItems = [
  { to: '/',            label: 'Connections', icon: Server },
  { to: '/credentials', label: 'Credentials', icon: Key },
  { to: '/terminal',    label: 'Terminal',    icon: Terminal },
];

export default function AppShell({ children, user, onLogout }: AppShellProps): JSX.Element {
  return (
    <div className="flex h-screen bg-neuro-bg text-gray-200 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-48 flex-shrink-0 flex flex-col border-r border-neuro-border bg-neuro-panel">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-neuro-border">
          <div className="text-neuro-cyan font-mono font-bold text-sm tracking-tight">&gt;_ NeuroTerm</div>
          <div className="text-gray-600 font-mono text-xs mt-0.5">tmux session manager</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded text-xs font-mono transition-colors ${
                  isActive
                    ? 'bg-neuro-cyan/10 text-neuro-cyan border border-neuro-cyan/20'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-neuro-bg'
                }`
              }
            >
              <Icon size={14} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User / Logout */}
        {(user || onLogout) && (
          <div className="p-3 border-t border-neuro-border">
            {user && (
              <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                <User size={12} className="text-gray-500 flex-shrink-0" />
                <span className="text-xs font-mono text-gray-400 truncate">{user.username}</span>
                {user.role === 'admin' && (
                  <span className="ml-auto text-[10px] font-mono text-neuro-cyan bg-neuro-cyan/10 px-1 rounded">
                    admin
                  </span>
                )}
              </div>
            )}
            {onLogout && (
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-2 px-3 py-2 rounded text-xs font-mono text-gray-500 hover:text-neuro-red hover:bg-neuro-red/10 transition-colors"
              >
                <LogOut size={12} />
                Sign Out
              </button>
            )}
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
