import { useSessionStore } from '../store/session-store';
import TerminalTabs from '../components/terminal/TerminalTabs';
import XtermPane from '../components/terminal/XtermPane';
import { Terminal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TerminalPage(): JSX.Element {
  const { tabs, activeTabId, setActiveTab, closeTab } = useSessionStore();
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

  return (
    <div className="flex flex-col h-full">
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
