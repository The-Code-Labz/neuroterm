import { Outlet, NavLink } from 'react-router-dom';
import { Terminal, PlugZap } from 'lucide-react';
import { useSessionStore } from '../../store/session-store';

export default function AppShell(): JSX.Element {
  const tabs = useSessionStore((s) => s.tabs);

  return (
    <div className="flex h-full w-full bg-neuro-bg overflow-hidden">
      {/* Sidebar */}
      <aside className="flex flex-col w-56 flex-shrink-0 bg-neuro-panel border-r border-neuro-border">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-neuro-border">
          <div className="w-7 h-7 rounded bg-neuro-cyan/10 border border-neuro-cyan/30 flex items-center justify-center">
            <Terminal size={14} className="text-neuro-cyan" />
          </div>
          <div>
            <div className="text-sm font-mono font-bold text-neuro-cyan leading-none">NeuroTerm</div>
            <div className="text-[10px] font-mono text-gray-600 mt-0.5">tmux session manager</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 p-2 border-b border-neuro-border">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded text-xs font-mono transition-colors ${
                isActive
                  ? 'bg-neuro-cyan/10 text-neuro-cyan border border-neuro-cyan/20'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-neuro-bg'
              }`
            }
          >
            <PlugZap size={13} />
            Connections
          </NavLink>

          <NavLink
            to="/terminal"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded text-xs font-mono transition-colors ${
                isActive
                  ? 'bg-neuro-cyan/10 text-neuro-cyan border border-neuro-cyan/20'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-neuro-bg'
              }`
            }
          >
            <Terminal size={13} />
            Terminal
            {tabs.length > 0 && (
              <span className="ml-auto bg-neuro-green/20 text-neuro-green text-[10px] px-1.5 py-0.5 rounded-full border border-neuro-green/30">
                {tabs.length}
              </span>
            )}
          </NavLink>
        </nav>

        {/* Active sessions mini list */}
        {tabs.length > 0 && (
          <div className="flex-1 overflow-y-auto p-2">
            <div className="text-[10px] font-mono text-gray-600 uppercase tracking-wider px-2 mb-1">Active</div>
            {tabs.map((tab) => (
              <NavLink
                key={tab.id}
                to="/terminal"
                className="flex items-center gap-2 px-2 py-1.5 rounded text-xs font-mono text-gray-400 hover:text-gray-200 hover:bg-neuro-bg transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  tab.status === 'connected'    ? 'bg-neuro-green' :
                  tab.status === 'reconnecting' ? 'bg-neuro-yellow' :
                  tab.status === 'disconnected' ? 'bg-neuro-red' :
                  'bg-gray-500'
                }`} />
                <span className="truncate">{tab.title}</span>
              </NavLink>
            ))}
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
