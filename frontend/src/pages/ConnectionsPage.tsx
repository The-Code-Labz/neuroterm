import ConnectionList from '../components/connections/ConnectionList';

export default function ConnectionsPage(): JSX.Element {
  return (
    <div className="flex flex-col h-full bg-canvas">
      <ConnectionList />
    </div>
  );
}
