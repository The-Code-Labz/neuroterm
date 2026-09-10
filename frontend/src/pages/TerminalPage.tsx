import { useSessionStore } from '../store/session-store';
import TerminalTabs from '../components/terminal/TerminalTabs';
import XtermPane from '../components/terminal/XtermPane';
import DesktopCanvas from '../components/desktop/DesktopCanvas';
import { Terminal, LayoutGrid, Rows3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TerminalPage(): JSX.Element {
  const { tabs, activeTabId, setActiveTab, closeTab, viewMode, setViewMode } = useSessionStore();
  const navigate = useNavigate();

  if (tabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Terminal size={40} className="text-gray-700" />
        <div className="text-center">
          <p className="text-sm font-mono text-gray-500">No active sessions</p>
          <p className="text-xs font-mono text-gray-600 mt-1">Go to Connections and click Connect</p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 rounded border border-neuro-cyan/50 text-neuro-cyan text-xs font-mono hover:bg-neuro-cyan/10 transition-colors"
        >
          Go to Connections
        </button>
      </div>
    );
  }

  const ViewToggle = (
    <div className="flex items-center gap-0.5 px-1.5 bg-neuro-panel border-b border-neuro-border">
      <button
        onClick={() => setViewMode('tabs')}
        title="Tabs view"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono rounded-t transition-colors ${
          viewMode === 'tabs' ? 'text-neuro-cyan bg-neuro-bg border border-b-0 border-neuro-border' : 'text-gray-500 hover:text-gray-300'
        }`}
      >
        <Rows3 size={12} /> Tabs
      </button>
      <button
        onClick={() => setViewMode('desktop')}
        title="NeuroDesk — windowed view"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono rounded-t transition-colors ${
          viewMode === 'desktop' ? 'text-neuro-cyan bg-neuro-bg border border-b-0 border-neuro-border' : 'text-gray-500 hover:text-gray-300'
        }`}
      >
        <LayoutGrid size={12} /> NeuroDesk
      </button>
    </div>
  );

  if (viewMode === 'desktop') {
    return (
      <div className="flex flex-col h-full">
        {ViewToggle}
        <div className="flex-1 min-h-0">
          <DesktopCanvas tabs={tabs} onCloseTab={closeTab} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {ViewToggle}
      {/* Tab bar */}
      <TerminalTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={setActiveTab}
        onClose={closeTab}
      />

      {/* Terminal panes — all mounted, only active one visible */}
      <div className="flex-1 overflow-hidden relative">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="absolute inset-0"
            style={{ display: tab.id === activeTabId ? 'flex' : 'none', flexDirection: 'column' }}
          >
            <XtermPane
              tabId={tab.id}
              sessionId={tab.sessionId}
              active={tab.id === activeTabId}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
