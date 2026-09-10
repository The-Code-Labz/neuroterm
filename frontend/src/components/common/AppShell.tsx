import { useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Server, Terminal, Key, LogOut, User, Menu as MenuIcon, X } from 'lucide-react';
import type { ApiUser } from '../../lib/api';
import LiveRegion from '../ui/LiveRegion';
import { useFocusTrap } from '../../lib/a11y';
import { useMediaQuery } from '../../hooks/useMediaQuery';

interface AppShellProps {
  children: React.ReactNode;
  user?: ApiUser | null;
  onLogout?: () => void;
}

const navItems = [
  { to: '/', label: 'Connections', icon: Server },
  { to: '/credentials', label: 'Credentials', icon: Key },
  { to: '/terminal', label: 'Terminal', icon: Terminal },
];

function Brand({ rail }: { rail: boolean }): JSX.Element {
  return (
    <div className="px-4 py-4 border-b border-edge-subtle">
      <div className="flex items-center gap-2 text-ink-strong font-sans font-semibold text-control tracking-tight">
        <span className="text-accent font-technical">&gt;_</span>
        {!rail && <span>NeuroTerm</span>}
      </div>
      {!rail && <div className="text-ink-muted text-meta mt-0.5">persistent session workspace</div>}
    </div>
  );
}

function NavList({ rail, onNavigate }: { rail: boolean; onNavigate?: () => void }): JSX.Element {
  return (
    <nav className="flex-1 px-2 py-2 space-y-0.5" aria-label="Primary">
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          title={rail ? label : undefined}
          className={({ isActive }) =>
            `relative flex items-center gap-3 rounded-md text-control font-sans transition-colors duration-140 ${
              rail ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
            } ${isActive ? 'bg-surface2 text-ink-strong' : 'text-ink-secondary hover:text-ink hover:bg-surface2/60'}`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
              <Icon size={16} strokeWidth={1.75} className="flex-shrink-0" />
              {!rail && <span>{label}</span>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function AccountFooter({ rail, user, onLogout }: { rail: boolean; user?: ApiUser | null; onLogout?: () => void }): JSX.Element | null {
  if (!user && !onLogout) return null;
  return (
    <div className="p-2 border-t border-edge-subtle space-y-1">
      {user && (
        <div className={`flex items-center gap-2 px-2 py-1.5 ${rail ? 'justify-center' : ''}`}>
          <User size={14} strokeWidth={1.75} className="text-ink-muted flex-shrink-0" />
          {!rail && (
            <>
              <span className="text-meta text-ink-secondary truncate font-technical">{user.username}</span>
              {user.role === 'admin' && (
                <span className="ml-auto text-[10px] leading-none font-sans text-accent bg-accent/10 px-1.5 py-0.5 rounded-sm">
                  admin
                </span>
              )}
            </>
          )}
        </div>
      )}
      {onLogout && (
        <button
          onClick={onLogout}
          title={rail ? 'Sign out' : undefined}
          className={`w-full flex items-center gap-2.5 rounded-md text-control font-sans text-ink-secondary hover:text-danger hover:bg-danger/10 transition-colors duration-140 ${
            rail ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
          }`}
        >
          <LogOut size={16} strokeWidth={1.75} />
          {!rail && 'Sign out'}
        </button>
      )}
    </div>
  );
}

export default function AppShell({ children, user, onLogout }: AppShellProps): JSX.Element {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(drawerRef, drawerOpen, () => setDrawerOpen(false));

  // Matches the `shell-md` Tailwind breakpoint (900px) used on the <aside>
  // below — kept in JS too because label visibility needs to toggle `title`
  // tooltips on/off, not just CSS display.
  const isFullSidebar = useMediaQuery('(min-width: 900px)');

  return (
    <div className="flex flex-col sm:flex-row h-dvh bg-canvas text-ink overflow-hidden">
      <LiveRegion />

      {/* Mobile top bar (<640px) */}
      <div className="sm:hidden flex-shrink-0 h-12 flex items-center gap-2 px-3 border-b border-edge-subtle bg-base">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          className="p-2 -ml-2 rounded-md text-ink-secondary hover:bg-surface2"
        >
          <MenuIcon size={18} strokeWidth={1.75} />
        </button>
        <span className="text-accent font-technical text-control">&gt;_</span>
        <span className="text-ink-strong font-sans font-semibold text-control">NeuroTerm</span>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="relative w-64 max-w-[80vw] h-full bg-base border-r border-edge flex flex-col animate-sheet-in"
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-edge-subtle">
              <div className="flex items-center gap-2 text-ink-strong font-sans font-semibold text-control">
                <span className="text-accent font-technical">&gt;_</span> NeuroTerm
              </div>
              <button onClick={() => setDrawerOpen(false)} aria-label="Close navigation" className="p-1.5 rounded-md text-ink-secondary hover:bg-surface2">
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>
            <NavList rail={false} onNavigate={() => setDrawerOpen(false)} />
            <AccountFooter rail={false} user={user} onLogout={onLogout} />
          </div>
        </div>
      )}

      {/* Desktop/tablet sidebar (>=640px) — icon rail 640-899px, full 900px+ */}
      <aside className="hidden sm:flex sm:w-16 shell-md:w-56 flex-shrink-0 flex-col border-r border-edge-subtle bg-base transition-[width] duration-160">
        <Brand rail={!isFullSidebar} />
        <NavList rail={!isFullSidebar} />
        <AccountFooter rail={!isFullSidebar} user={user} onLogout={onLogout} />
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 min-h-0 overflow-hidden">{children}</main>
    </div>
  );
}
