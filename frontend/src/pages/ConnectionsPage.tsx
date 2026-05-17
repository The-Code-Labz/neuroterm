import ConnectionList from '../components/connections/ConnectionList';

export default function ConnectionsPage(): JSX.Element {
  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-neuro-border">
        <div>
          <h1 className="text-sm font-mono font-semibold text-gray-200">SSH Connections</h1>
          <p className="text-xs font-mono text-gray-500 mt-0.5">
            All sessions use tmux — disconnect and reconnect without losing state
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ConnectionList />
      </div>
    </div>
  );
}
