import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronRight, ChevronDown, Folder, FolderOpen, File as FileIcon, RefreshCw, Plus,
  FolderPlus, Trash2, Pencil, Copy, Scissors, ClipboardPaste, Files, Link,
} from 'lucide-react';
import { api, type FileScope, type FileEntryInfo } from '../../lib/api';
import IconButton from '../ui/IconButton';
import ContextMenu, { type ContextMenuState, type ContextMenuItem } from '../ui/ContextMenu';

interface DirNodeState {
  entries: FileEntryInfo[];
  expanded: boolean;
  loading: boolean;
  error: string | null;
}

export interface ClipboardEntry {
  path: string;
  isDir: boolean;
  mode: 'copy' | 'cut';
}

interface Selected { path: string; isDir: boolean }

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
  changeSignal: { paths: string[]; tick: number } | null;
  onCreateFile: (dirPath: string) => void;
  onCreateFolder: (dirPath: string) => void;
  onDeleteEntry: (path: string, isDir: boolean) => void;
  onRenameEntry: (path: string, isDir: boolean, newName: string) => void;
  onDuplicateEntry: (path: string, isDir: boolean) => void;
  clipboard: ClipboardEntry | null;
  onCutEntry: (path: string, isDir: boolean) => void;
  onCopyEntry: (path: string, isDir: boolean) => void;
  onPasteInto: (destDir: string) => void;
}

function joinPath(base: string, name: string): string {
  return base.endsWith('/') ? `${base}${name}` : `${base}/${name}`;
}

function parentOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx > 0 ? path.slice(0, idx) : '/';
}

/** Shallow-compares two entry lists by content (name/type/size/mtime), order
 *  included. Used to skip a background re-render entirely when a poll/watch
 *  tick re-fetched a directory that hasn't actually changed — see
 *  `refreshDir` below. */
function entriesEqual(a: FileEntryInfo[], b: FileEntryInfo[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.name !== y.name || x.type !== y.type || x.size !== y.size || x.mtime !== y.mtime) return false;
  }
  return true;
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
  onCreateFolder,
  onDeleteEntry,
  onRenameEntry,
  onDuplicateEntry,
  clipboard,
  onCutEntry,
  onCopyEntry,
  onPasteInto,
}: FileTreeProps): JSX.Element {
  const [nodes, setNodes] = useState<Record<string, DirNodeState>>({});
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; isDir: boolean; value: string } | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const watchedDirs = useRef<Set<string>>(new Set());
  const renameInputRef = useRef<HTMLInputElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);

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
  // WS reporting a change, or by the SSH poll ticking). Two things make this
  // non-disruptive:
  //  1. It never flips `loading` — the currently rendered entries (and every
  //     expanded descendant's own state) stay on screen while the refetch is
  //     in flight.
  //  2. It diffs the freshly-fetched entries against what's already
  //     rendered (entriesEqual) and skips the state update entirely when
  //     nothing actually changed. Without this, every poll tick/notification
  //     — even a no-op one — replaced the entries array wholesale, forcing a
  //     re-render of the whole directory's row list. That was harmless
  //     functionally (React still reconciles by key) but visibly disruptive:
  //     it could interrupt an in-progress click, a context menu's outside-
  //     click listener, or hover state, making the tree feel like it was
  //     "still refreshing" even though nothing was actually blanking anymore.
  const refreshDir = useCallback(async (path: string) => {
    try {
      const result = await api.files.list(scope, path);
      setNodes((prev) => {
        const existing = prev[path];
        if (!existing) return prev; // no longer tracked (e.g. collapsed/unmounted since)
        if (!existing.error && entriesEqual(existing.entries, result.entries)) return prev; // no-op tick — skip the re-render
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
    setSelected(null);
    setRenaming(null);

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
  // a change inside it — never blanks what's already on screen, and skips
  // the update entirely when the refetch shows nothing actually changed
  // (see refreshDir above).
  useEffect(() => {
    if (!changeSignal) return;
    for (const path of changeSignal.paths) {
      if (nodes[path]?.expanded) void refreshDir(path);
    }
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

  const beginRename = (path: string, isDir: boolean) => {
    const name = path === rootPath ? path : path.split('/').pop() ?? '';
    setRenaming({ path, isDir, value: name });
  };

  const submitRename = () => {
    if (!renaming) return;
    const originalName = renaming.path.split('/').pop() ?? '';
    const next = renaming.value.trim();
    setRenaming(null);
    if (next && next !== originalName) onRenameEntry(renaming.path, renaming.isDir, next);
  };

  useEffect(() => {
    if (renaming) requestAnimationFrame(() => { renameInputRef.current?.focus(); renameInputRef.current?.select(); });
  }, [renaming?.path]);

  const copyPathToClipboard = (path: string) => { void navigator.clipboard.writeText(path).catch(() => {}); };
  const relativePath = (path: string): string => {
    if (!rootPath) return path;
    if (path === rootPath) return '.';
    return path.startsWith(`${rootPath}/`) ? path.slice(rootPath.length + 1) : path;
  };

  const openMenu = (e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const buildEntryMenuItems = (path: string, isDir: boolean, isRoot: boolean): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (isDir) {
      items.push(
        { label: 'New File…', icon: <Plus size={13} strokeWidth={1.75} />, onSelect: () => onCreateFile(path) },
        { label: 'New Folder…', icon: <FolderPlus size={13} strokeWidth={1.75} />, onSelect: () => onCreateFolder(path) },
        { label: 'Refresh', icon: <RefreshCw size={13} strokeWidth={1.75} />, onSelect: () => void loadDir(path, true), separatorBefore: true },
      );
    }
    if (!isRoot) {
      items.push(
        { label: 'Rename', icon: <Pencil size={13} strokeWidth={1.75} />, onSelect: () => beginRename(path, isDir), separatorBefore: isDir },
        { label: 'Duplicate', icon: <Files size={13} strokeWidth={1.75} />, onSelect: () => onDuplicateEntry(path, isDir) },
        { label: 'Cut', icon: <Scissors size={13} strokeWidth={1.75} />, onSelect: () => onCutEntry(path, isDir) },
        { label: 'Copy', icon: <Copy size={13} strokeWidth={1.75} />, onSelect: () => onCopyEntry(path, isDir) },
      );
    }
    if (isDir) {
      items.push({
        label: 'Paste', icon: <ClipboardPaste size={13} strokeWidth={1.75} />, disabled: !clipboard,
        onSelect: () => onPasteInto(path), separatorBefore: isRoot,
      });
    }
    items.push(
      { label: 'Copy Path', icon: <Link size={13} strokeWidth={1.75} />, onSelect: () => copyPathToClipboard(path), separatorBefore: true },
      { label: 'Copy Relative Path', icon: <Link size={13} strokeWidth={1.75} />, onSelect: () => copyPathToClipboard(relativePath(path)) },
    );
    if (!isRoot) {
      items.push({ label: 'Delete', icon: <Trash2 size={13} strokeWidth={1.75} />, danger: true, onSelect: () => onDeleteEntry(path, isDir), separatorBefore: true });
    }
    return items;
  };

  const handleTreeKeyDown = (e: React.KeyboardEvent) => {
    if (renaming) return;
    if (!selected) return;
    const isRoot = selected.path === rootPath;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'F2' && !isRoot) {
      e.preventDefault();
      beginRename(selected.path, selected.isDir);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !isRoot) {
      e.preventDefault();
      onDeleteEntry(selected.path, selected.isDir);
    } else if (mod && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      onCopyEntry(selected.path, selected.isDir);
    } else if (mod && e.key.toLowerCase() === 'x' && !isRoot) {
      e.preventDefault();
      onCutEntry(selected.path, selected.isDir);
    } else if (mod && e.key.toLowerCase() === 'v' && clipboard) {
      e.preventDefault();
      onPasteInto(selected.isDir ? selected.path : parentOf(selected.path));
    }
  };

  const renderDir = (path: string, depth: number): JSX.Element => {
    const node = nodes[path];
    const isRoot = path === rootPath;
    const isRenaming = renaming?.path === path;
    const isCut = clipboard?.path === path && clipboard.mode === 'cut';
    return (
      <div key={path}>
        <div
          className={`group flex items-center gap-1 h-6 pr-2 rounded cursor-pointer text-meta text-ink-secondary ${
            selected?.path === path ? 'bg-surface2 text-ink-strong' : 'hover:bg-surface2'
          } ${isCut ? 'opacity-50' : ''}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          onContextMenu={(e) => { setSelected({ path, isDir: true }); openMenu(e, buildEntryMenuItems(path, true, isRoot)); }}
        >
          <button
            type="button"
            className="flex items-center gap-1 flex-1 min-w-0 text-left"
            onClick={() => { setSelected({ path, isDir: true }); toggle(path); }}
          >
            {node?.expanded ? <ChevronDown size={12} strokeWidth={2} className="flex-shrink-0" /> : <ChevronRight size={12} strokeWidth={2} className="flex-shrink-0" />}
            {node?.expanded ? <FolderOpen size={13} strokeWidth={1.75} className="flex-shrink-0 text-accent" /> : <Folder size={13} strokeWidth={1.75} className="flex-shrink-0" />}
            {isRenaming ? (
              <input
                ref={renameInputRef}
                value={renaming.value}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') submitRename();
                  else if (e.key === 'Escape') setRenaming(null);
                }}
                onBlur={() => setRenaming(null)}
                className="flex-1 min-w-0 bg-surface3 border border-accent rounded px-1 text-meta font-technical text-ink-strong outline-none"
              />
            ) : (
              <span className="truncate font-technical">{path === rootPath ? path : path.split('/').pop()}</span>
            )}
          </button>
          {!isRenaming && (
            <span className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0">
              <IconButton size="sm" icon={<Plus size={11} strokeWidth={2} />} label="New file" onClick={() => onCreateFile(path)} />
              {!isRoot && (
                <IconButton size="sm" icon={<Trash2 size={11} strokeWidth={2} />} label="Delete folder" onClick={() => onDeleteEntry(path, true)} />
              )}
            </span>
          )}
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

  const renderFile = (path: string, name: string, depth: number): JSX.Element => {
    const isRenaming = renaming?.path === path;
    const isCut = clipboard?.path === path && clipboard.mode === 'cut';
    return (
      <div
        key={path}
        className={`group flex items-center gap-1 h-6 pr-2 rounded cursor-pointer text-meta ${
          path === activeFilePath || selected?.path === path ? 'bg-surface2 text-ink-strong' : 'text-ink-secondary hover:bg-surface2'
        } ${isCut ? 'opacity-50' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onContextMenu={(e) => { setSelected({ path, isDir: false }); openMenu(e, buildEntryMenuItems(path, false, false)); }}
      >
        <button
          type="button"
          className="flex items-center gap-1 flex-1 min-w-0 text-left"
          onClick={() => { setSelected({ path, isDir: false }); onOpenFile(path); }}
        >
          <FileIcon size={12} strokeWidth={1.75} className="flex-shrink-0" style={{ marginLeft: 14 }} />
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renaming.value}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') submitRename();
                else if (e.key === 'Escape') setRenaming(null);
              }}
              onBlur={() => setRenaming(null)}
              className="flex-1 min-w-0 bg-surface3 border border-accent rounded px-1 text-meta font-technical text-ink-strong outline-none"
            />
          ) : (
            <span className="truncate font-technical">{name}</span>
          )}
        </button>
        {!isRenaming && (
          <IconButton
            size="sm"
            className="opacity-0 group-hover:opacity-100 flex-shrink-0"
            icon={<Trash2 size={11} strokeWidth={2} />}
            label="Delete file"
            onClick={() => onDeleteEntry(path, false)}
          />
        )}
      </div>
    );
  };

  return (
    <div
      ref={treeRef}
      className="h-full flex flex-col"
      onKeyDown={handleTreeKeyDown}
      onContextMenu={(e) => {
        if (!rootPath) return;
        setSelected({ path: rootPath, isDir: true });
        openMenu(e, buildEntryMenuItems(rootPath, true, true));
      }}
    >
      <div className="flex items-center gap-2 h-8 px-2 border-b border-edge-subtle flex-shrink-0">
        <span className="flex-1 text-meta text-ink-muted uppercase tracking-wide">Explorer</span>
        <IconButton size="sm" icon={<FolderPlus size={13} strokeWidth={1.75} />} label="New folder at root" onClick={() => rootPath && onCreateFolder(rootPath)} disabled={!rootPath} />
        <IconButton size="sm" icon={<Plus size={13} strokeWidth={1.75} />} label="New file at root" onClick={() => rootPath && onCreateFile(rootPath)} disabled={!rootPath} />
        <IconButton size="sm" icon={<RefreshCw size={13} strokeWidth={1.75} />} label="Refresh" onClick={() => rootPath && void loadDir(rootPath, true)} disabled={!rootPath} />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {rootError && <div className="p-2 text-meta text-danger">{rootError}</div>}
        {!rootError && !rootPath && <div className="p-2 text-meta text-ink-muted">Loading…</div>}
        {rootPath && renderDir(rootPath, 0)}
      </div>
      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
