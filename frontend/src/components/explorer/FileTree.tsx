import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, File as FileIcon, RefreshCw, Plus, FolderPlus, Trash2 } from 'lucide-react';
import { api, type FileScope, type FileEntryInfo } from '../../lib/api';
import IconButton from '../ui/IconButton';

interface DirNodeState {
  entries: FileEntryInfo[];
  expanded: boolean;
  loading: boolean;
  error: string | null;
}

interface FileTreeProps {
  scope: FileScope;
  /** Requested root path, or '' to let the backend pick its own default
   *  (WORKSPACE_PATH for local, '/' for ssh — see files.routes.ts). Do not
   *  hardcode a guessed root here: the backend is the source of truth for
   *  what its own default actually is. */
  rootPathRequest: string;
  activeFilePath: string | null;
  onOpenFile: (path: string) => void;
  watch: (path: string) => void;
  unwatch: (path: string) => void;
  /** Bumped (with the changed path) whenever the watch WS reports a change
   *  at a path this tree might have cached — see ExplorerWorkspace. */
  changeSignal: { path: string; tick: number } | null;
  onCreateFile: (dirPath: string) => void;
  onDeleteEntry: (path: string, isDir: boolean) => void;
}

function joinPath(base: string, name: string): string {
  return base.endsWith('/') ? `${base}${name}` : `${base}/${name}`;
}

export default function FileTree({
  scope,
  rootPathRequest,
  activeFilePath,
  onOpenFile,
  watch,
  unwatch,
  changeSignal,
  onCreateFile,
  onDeleteEntry,
}: FileTreeProps): JSX.Element {
  const [nodes, setNodes] = useState<Record<string, DirNodeState>>({});
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);
  const watchedDirs = useRef<Set<string>>(new Set());

  const loadDir = useCallback(async (path: string, expand: boolean) => {
    setNodes((prev) => ({ ...prev, [path]: { entries: prev[path]?.entries ?? [], expanded: expand, loading: true, error: null } }));
    try {
      const result = await api.files.list(scope, path);
      setNodes((prev) => ({ ...prev, [path]: { entries: result.entries, expanded: expand, loading: false, error: null } }));
      if (expand && !watchedDirs.current.has(path)) {
        watchedDirs.current.add(path);
        watch(path);
      }
    } catch (err) {
      setNodes((prev) => ({ ...prev, [path]: { entries: prev[path]?.entries ?? [], expanded: expand, loading: false, error: (err as Error).message } }));
    }
  }, [scope, watch]);

  // Background refresh for an already-open directory (triggered by the watch
  // WS reporting a change). Unlike loadDir, this never flips `loading` — the
  // currently rendered entries (and every expanded descendant's own state,
  // which this never touches) stay on screen the whole time, and only the
  // entry list itself is swapped once the refetch resolves. Flipping
  // `loading` here previously blanked the ENTIRE visible subtree (see render:
  // children only render when `!node.loading`), so any directory with
  // frequent write activity nearby made the whole explorer appear to flicker
  // empty every few seconds.
  const refreshDir = useCallback(async (path: string) => {
    try {
      const result = await api.files.list(scope, path);
      setNodes((prev) => {
        const existing = prev[path];
        if (!existing) return prev; // no longer tracked (e.g. collapsed/unmounted since)
        return { ...prev, [path]: { ...existing, entries: result.entries, error: null } };
      });
    } catch (err) {
      setNodes((prev) => {
        const existing = prev[path];
        if (!existing) return prev;
        return { ...prev, [path]: { ...existing, error: (err as Error).message } };
      });
    }
  }, [scope]);

  // Root changes (switching which session's filesystem is browsed) — reset
  // everything and resolve the new root fresh. The very first fetch uses
  // whatever `rootPathRequest` was given ('' asks the backend for its own
  // default) — the response's own `path` becomes the tree's actual root
  // from then on, so the label/keys always reflect what the backend is
  // really browsing rather than a guess made here.
  useEffect(() => {
    for (const path of watchedDirs.current) unwatch(path);
    watchedDirs.current.clear();
    setNodes({});
    setRootPath(null);
    setRootError(null);

    let cancelled = false;
    void (async () => {
      try {
        const result = await api.files.list(scope, rootPathRequest);
        if (cancelled) return;
        setRootPath(result.path);
        setNodes({ [result.path]: { entries: result.entries, expanded: true, loading: false, error: null } });
        watchedDirs.current.add(result.path);
        watch(result.path);
      } catch (err) {
        if (!cancelled) setRootError((err as Error).message);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, rootPathRequest]);

  // Refresh a directory in the background when the watch connection reports
  // a change inside it — never blanks what's already on screen (see
  // refreshDir above).
  useEffect(() => {
    if (!changeSignal) return;
    if (nodes[changeSignal.path]?.expanded) void refreshDir(changeSignal.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeSignal]);

  const toggle = (path: string) => {
    const node = nodes[path];
    if (!node || !node.expanded) {
      void loadDir(path, true);
      return;
    }
    if (watchedDirs.current.has(path)) { watchedDirs.current.delete(path); unwatch(path); }
    setNodes((prev) => ({ ...prev, [path]: { ...node, expanded: false } }));
  };

  const renderDir = (path: string, depth: number): JSX.Element => {
    const node = nodes[path];
    return (
      <div key={path}>
        <div
          className="group flex items-center gap-1 h-6 pr-2 hover:bg-surface2 rounded cursor-pointer text-meta text-ink-secondary"
          style={{ paddingLeft: 6 + depth * 14 }}
        >
          <button
            type="button"
            className="flex items-center gap-1 flex-1 min-w-0 text-left"
            onClick={() => toggle(path)}
          >
            {node?.expanded ? <ChevronDown size={12} strokeWidth={2} className="flex-shrink-0" /> : <ChevronRight size={12} strokeWidth={2} className="flex-shrink-0" />}
            {node?.expanded ? <FolderOpen size={13} strokeWidth={1.75} className="flex-shrink-0 text-accent" /> : <Folder size={13} strokeWidth={1.75} className="flex-shrink-0" />}
            <span className="truncate font-technical">{path === rootPath ? path : path.split('/').pop()}</span>
          </button>
          <span className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0">
            <IconButton size="sm" icon={<Plus size={11} strokeWidth={2} />} label="New file" onClick={() => onCreateFile(path)} />
            {path !== rootPath && (
              <IconButton size="sm" icon={<Trash2 size={11} strokeWidth={2} />} label="Delete folder" onClick={() => onDeleteEntry(path, true)} />
            )}
          </span>
        </div>
        {node?.expanded && (
          <div>
            {node.loading && <div className="text-meta text-ink-muted" style={{ paddingLeft: 6 + (depth + 1) * 14 }}>Loading…</div>}
            {node.error && <div className="text-meta text-danger" style={{ paddingLeft: 6 + (depth + 1) * 14 }}>{node.error}</div>}
            {!node.loading && !node.error && node.entries.map((entry) =>
              entry.type === 'dir'
                ? renderDir(joinPath(path, entry.name), depth + 1)
                : renderFile(joinPath(path, entry.name), entry.name, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  const renderFile = (path: string, name: string, depth: number): JSX.Element => (
    <div
      key={path}
      className={`group flex items-center gap-1 h-6 pr-2 rounded cursor-pointer text-meta ${
        path === activeFilePath ? 'bg-surface2 text-ink-strong' : 'text-ink-secondary hover:bg-surface2'
      }`}
      style={{ paddingLeft: 6 + depth * 14 }}
    >
      <button type="button" className="flex items-center gap-1 flex-1 min-w-0 text-left" onClick={() => onOpenFile(path)}>
        <FileIcon size={12} strokeWidth={1.75} className="flex-shrink-0" style={{ marginLeft: 14 }} />
        <span className="truncate font-technical">{name}</span>
      </button>
      <IconButton
        size="sm"
        className="opacity-0 group-hover:opacity-100 flex-shrink-0"
        icon={<Trash2 size={11} strokeWidth={2} />}
        label="Delete file"
        onClick={() => onDeleteEntry(path, false)}
      />
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 h-8 px-2 border-b border-edge-subtle flex-shrink-0">
        <span className="flex-1 text-meta text-ink-muted uppercase tracking-wide">Explorer</span>
        <IconButton size="sm" icon={<FolderPlus size={13} strokeWidth={1.75} />} label="New file at root" onClick={() => rootPath && onCreateFile(rootPath)} disabled={!rootPath} />
        <IconButton size="sm" icon={<RefreshCw size={13} strokeWidth={1.75} />} label="Refresh" onClick={() => rootPath && void loadDir(rootPath, true)} disabled={!rootPath} />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {rootError && <div className="p-2 text-meta text-danger">{rootError}</div>}
        {!rootError && !rootPath && <div className="p-2 text-meta text-ink-muted">Loading…</div>}
        {rootPath && renderDir(rootPath, 0)}
      </div>
    </div>
  );
}
