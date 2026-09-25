import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Terminal, LayoutGrid, Rows3, Plus, FolderTree } from 'lucide-react';
import { useSessionStore } from '../store/session-store';
import TerminalTabs from '../components/terminal/TerminalTabs';
import XtermPane from '../components/terminal/XtermPane';
import DesktopCanvas from '../components/desktop/DesktopCanvas';
import SegmentedControl from '../components/ui/SegmentedControl';
import IconButton from '../components/ui/IconButton';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';

// CodeMirror + its language-data package are the heaviest dependency in the
// app (see the frontend build's chunk-size warning) — code-split so that
// weight is only fetched by users who actually open the Explorer view, not
// bundled into the initial load for everyone using Tabs/NeuroDesk.
const ExplorerWorkspace = lazy(() => import('../components/explorer/ExplorerWorkspace'));

export default function TerminalPage(): JSX.Element {
  const { tabs, activeTabId, setActiveTab, closeTab, viewMode, setViewMode } = useSessionStore();
  const navigate = useNavigate();

  if (tabs.length === 0) {
    return (
      <EmptyState
        className="h-full"
        icon={<Terminal size={32} strokeWidth={1.5} />}
        title="No active sessions"
        description="Go to Connections and connect or resume a session to open it here."
        action={
          <Button variant="primary" onClick={() => navigate('/')}>
            Go to Connections
          </Button>
        }
      />
    );
  }

  const toolbar = (
    <div className="flex items-center gap-3 h-11 px-4 bg-surface1 border-b border-edge-subtle flex-shrink-0">
      <span className="text-control text-ink-secondary">
        {tabs.length} session{tabs.length === 1 ? '' : 's'}
      </span>
      <div className="flex-1" />
      <SegmentedControl
        aria-label="Workspace view"
        size="sm"
        value={viewMode}
        onChange={setViewMode}
        options={[
          { value: 'tabs', label: 'Tabs', icon: <Rows3 size={13} strokeWidth={1.75} /> },
          { value: 'desktop', label: 'NeuroDesk', icon: <LayoutGrid size={13} strokeWidth={1.75} /> },
          { value: 'explorer', label: 'Explorer', icon: <FolderTree size={13} strokeWidth={1.75} /> },
        ]}
      />
      <IconButton icon={<Plus size={16} strokeWidth={1.75} />} label="New session" size="sm" onClick={() => navigate('/')} />
    </div>
  );

  if (viewMode === 'desktop') {
    return (
      <div className="flex flex-col h-full">
        {toolbar}
        <div className="flex-1 min-h-0">
          <DesktopCanvas tabs={tabs} onCloseTab={closeTab} />
        </div>
      </div>
    );
  }

  if (viewMode === 'explorer') {
    return (
      <div className="flex flex-col h-full">
        {toolbar}
        <div className="flex-1 min-h-0">
          <Suspense fallback={<div className="h-full flex items-center justify-center text-meta text-ink-muted">Loading explorer…</div>}>
            <ExplorerWorkspace tabs={tabs} />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {toolbar}
      <TerminalTabs tabs={tabs} activeTabId={activeTabId} onSelect={setActiveTab} onClose={closeTab} />

      {/* Terminal panes — all mounted, only active one visible */}
      <div className="flex-1 overflow-hidden relative bg-termbg">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="absolute inset-0"
            style={{ display: tab.id === activeTabId ? 'flex' : 'none', flexDirection: 'column' }}
          >
            <XtermPane tabId={tab.id} sessionId={tab.sessionId} active={tab.id === activeTabId} chrome="tab" title={tab.title} />
          </div>
        ))}
      </div>
    </div>
  );
}
