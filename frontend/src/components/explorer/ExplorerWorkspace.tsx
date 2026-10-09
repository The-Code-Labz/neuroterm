import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Save, RotateCcw, FolderTree } from 'lucide-react';
import { useSessionStore, type TerminalTab } from '../../store/session-store';
import { api, type FileScope } from '../../lib/api';
import { useFileWatch } from '../../hooks/useFileWatch';
import FileTree, { type ClipboardEntry } from './FileTree';
import EditorTabs from './EditorTabs';
import CodeEditor from './CodeEditor';
import PromptDialog from './PromptDialog';
import ConfirmDialog from '../ui/ConfirmDialog';
import XtermPane from '../terminal/XtermPane';
import Select from '../ui/Select';
import IconButton from '../ui/IconButton';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import { announce } from '../../store/live-region-store';

interface OpenFile {
  path: string;
  content: string;
  savedContent: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  binary: boolean;
  externalChange: boolean;
}

interface ExplorerWorkspaceProps {
  tabs: TerminalTab[];
}

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
const TERMINAL_MIN = 100;
const TERMINAL_MAX_RATIO = 0.7;

function joinPath(base: string, name: string): string {
  return base.endsWith('/') ? `${base}${name}` : `${base}/${name}`;
}

function parentOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx > 0 ? path.slice(0, idx) : '/';
}

function suffixName(baseName: string, n: number): string {
  const dot = baseName.lastIndexOf('.');
  return dot > 0 ? `${baseName.slice(0, dot)} (${n})${baseName.slice(dot)}` : `${baseName} (${n})`;
}

/** Retries `attempt` with an auto-incremented, VS-Code-style suffix
 *  ("name (1).ext", "name (2).ext", ...) whenever the backend reports a 409
 *  name collision — used by Paste and Duplicate so the user never has to
 *  manually resolve a naming conflict. Any other failure (permissions,
 *  connection lost, etc.) propagates immediately. */
async function withCollisionRetry(attempt: (candidateName: string) => Promise<unknown>, baseName: string): Promise<string> {
  for (let i = 0; i <= 50; i++) {
    const candidate = i === 0 ? baseName : suffixName(baseName, i);
    try {
      await attempt(candidate);
      return candidate;
    } catch (err) {
      if (i === 50 || (err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error('Could not find a free name');
}

export default function ExplorerWorkspace({ tabs }: ExplorerWorkspaceProps): JSX.Element {
  const connections = useSessionStore((s) => s.connections);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(tabs[0]?.id ?? null);
  const selectedTab = tabs.find((t) => t.id === selectedTabId) ?? tabs[0] ?? null;

  const connection = selectedTab ? connections.find((c) => c.id === selectedTab.connectionId) : undefined;
  const tabMode = selectedTab?.mode;
  const backendConnectionId = connection?.backendId;
  // Memoized on stable primitives, not recomputed as a fresh object every
  // render — an inline object literal here fed into FileTree's/useFileWatch's
  // effect deps re-fired /api/files/list on every keystroke (any state
  // update in this component re-renders it), since a new object reference
  // looks like a "the scope changed" signal even when it didn't.
  const scope: FileScope | null = useMemo(() => {
    if (!tabMode) return null;
    return tabMode === 'ssh' && backendConnectionId ? { mode: 'ssh', connection_id: backendConnectionId } : { mode: 'local' };
  }, [tabMode, backendConnectionId]);
  // '' asks the backend for its own default root (WORKSPACE_PATH for local,
  // '/' for ssh) rather than guessing it here — see FileTree's rootPathRequest.
  const rootPathRequest = '';
  const scopeKey = scope ? (scope.mode === 'ssh' ? `ssh:${scope.connection_id}` : 'local') : 'none';
  const localScope = useMemo<FileScope>(() => ({ mode: 'local' }), []);

  const [openFiles, setOpenFiles] = useState<Record<string, OpenFile>>({});
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [newFileDialogDir, setNewFileDialogDir] = useState<string | null>(null);
  const [newFileBusy, setNewFileBusy] = useState(false);
  const [newFileError, setNewFileError] = useState<string | null>(null);
  const [newFolderDialogDir, setNewFolderDialogDir] = useState<string | null>(null);
  const [newFolderBusy, setNewFolderBusy] = useState(false);
  const [newFolderError, setNewFolderError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; isDir: boolean } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [closeConfirmPath, setCloseConfirmPath] = useState<string | null>(null);
  const [changeSignal, setChangeSignal] = useState<{ paths: string[]; tick: number } | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardEntry | null>(null);
  const [showTerminal, setShowTerminal] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const containerRef = useRef<HTMLDivElement>(null);
  const tickRef = useRef(0);

  const onWatchChange = useCallback((path: string) => {
    tickRef.current += 1;
    setChangeSignal({ paths: [path], tick: tickRef.current });
    setOpenFiles((prev) => (prev[path] ? { ...prev, [path]: { ...prev[path], externalChange: true } } : prev));
  }, []);

  const { watch, unwatch } = useFileWatch({
    scope: scope ?? localScope,
    onChange: onWatchChange,
    enabled: !!scope,
  });

  const loadFile = useCallback(async (path: string, opts?: { silent?: boolean }) => {
    if (!scope) return;
    setOpenFiles((prev) => ({
      ...prev,
      [path]: prev[path]
        ? { ...prev[path], loading: !opts?.silent, externalChange: false }
        : { path, content: '', savedContent: '', loading: true, saving: false, error: null, binary: false, externalChange: false },
    }));
    try {
      const result = await api.files.read(scope, path);
      setOpenFiles((prev) => ({
        ...prev,
        [path]: {
          path,
          content: result.content ?? '',
          savedContent: result.content ?? '',
          loading: false,
          saving: false,
          error: null,
          binary: result.binary,
          externalChange: false,
        },
      }));
    } catch (err) {
      setOpenFiles((prev) => ({
        ...prev,
        [path]: prev[path]
          ? { ...prev[path], loading: false, error: (err as Error).message }
          : { path, content: '', savedContent: '', loading: false, saving: false, error: (err as Error).message, binary: false, externalChange: false },
      }));
    }
  }, [scope]);

  const openFile = useCallback((path: string) => {
    setActiveFilePath(path);
    if (!openFiles[path]) {
      watch(path);
      void loadFile(path);
    }
  }, [openFiles, watch, loadFile]);

  const doCloseFile = useCallback((path: string) => {
    unwatch(path);
    setOpenFiles((prev) => { const { [path]: _removed, ...rest } = prev; return rest; });
    setActiveFilePath((prev) => (prev === path ? null : prev));
  }, [unwatch]);

  const closeFile = useCallback((path: string) => {
    const file = openFiles[path];
    if (file && file.content !== file.savedContent) { setCloseConfirmPath(path); return; }
    doCloseFile(path);
  }, [openFiles, doCloseFile]);

  const saveFile = useCallback(async (path: string) => {
    if (!scope) return;
    const file = openFiles[path];
    if (!file || file.saving) return;
    setOpenFiles((prev) => ({ ...prev, [path]: { ...prev[path], saving: true, error: null } }));
    try {
      await api.files.write(scope, path, file.content);
      setOpenFiles((prev) => ({ ...prev, [path]: { ...prev[path], saving: false, savedContent: file.content, externalChange: false } }));
      announce(`Saved ${path.split('/').pop()}`);
    } catch (err) {
      setOpenFiles((prev) => ({ ...prev, [path]: { ...prev[path], saving: false, error: (err as Error).message } }));
    }
  }, [scope, openFiles]);

  const updateContent = useCallback((path: string, content: string) => {
    setOpenFiles((prev) => (prev[path] ? { ...prev, [path]: { ...prev[path], content } } : prev));
  }, []);

  const handleCreateFile = useCallback(async (fileName: string) => {
    if (!scope || !newFileDialogDir) return;
    setNewFileBusy(true);
    setNewFileError(null);
    const path = joinPath(newFileDialogDir, fileName);
    try {
      await api.files.write(scope, path, '');
      setNewFileDialogDir(null);
      tickRef.current += 1;
      setChangeSignal({ paths: [newFileDialogDir], tick: tickRef.current });
      openFile(path);
    } catch (err) {
      setNewFileError((err as Error).message);
    } finally {
      setNewFileBusy(false);
    }
  }, [scope, newFileDialogDir, openFile]);

  const handleCreateFolder = useCallback(async (folderName: string) => {
    if (!scope || !newFolderDialogDir) return;
    setNewFolderBusy(true);
    setNewFolderError(null);
    const path = joinPath(newFolderDialogDir, folderName);
    try {
      await api.files.mkdir(scope, path);
      setNewFolderDialogDir(null);
      tickRef.current += 1;
      setChangeSignal({ paths: [newFolderDialogDir], tick: tickRef.current });
    } catch (err) {
      setNewFolderError((err as Error).message);
    } finally {
      setNewFolderBusy(false);
    }
  }, [scope, newFolderDialogDir]);

  // Remaps every open editor tab under `oldPath` (itself, or — for a renamed/
  // moved directory — anything nested beneath it) to the equivalent path
  // under `newPath`, re-subscribing the file-watch for each. Shared by
  // rename and cut-paste (move), which both relocate a path on disk without
  // touching its content.
  const remapOpenFiles = useCallback((oldPath: string, newPath: string, isDir: boolean) => {
    setOpenFiles((prev) => {
      const next: Record<string, OpenFile> = {};
      for (const [p, f] of Object.entries(prev)) {
        if (p === oldPath || (isDir && p.startsWith(`${oldPath}/`))) {
          const remapped = newPath + p.slice(oldPath.length);
          unwatch(p);
          watch(remapped);
          next[remapped] = { ...f, path: remapped };
        } else {
          next[p] = f;
        }
      }
      return next;
    });
    setActiveFilePath((prev) => {
      if (prev === oldPath) return newPath;
      if (isDir && prev && prev.startsWith(`${oldPath}/`)) return newPath + prev.slice(oldPath.length);
      return prev;
    });
    setClipboard((c) => (c && (c.path === oldPath || (isDir && c.path.startsWith(`${oldPath}/`))) ? null : c));
  }, [watch, unwatch]);

  const handleRenameEntry = useCallback(async (oldPath: string, isDir: boolean, newName: string) => {
    if (!scope) return;
    const parent = parentOf(oldPath);
    const newPath = joinPath(parent, newName);
    try {
      await api.files.rename(scope, oldPath, newPath);
      remapOpenFiles(oldPath, newPath, isDir);
      tickRef.current += 1;
      setChangeSignal({ paths: [parent], tick: tickRef.current });
      announce(`Renamed to ${newName}`);
    } catch (err) {
      announce(`Rename failed: ${(err as Error).message}`);
    }
  }, [scope, remapOpenFiles]);

  const handleDuplicateEntry = useCallback(async (path: string, isDir: boolean) => {
    if (!scope) return;
    const parent = parentOf(path);
    const name = path.split('/').pop() ?? '';
    const dot = !isDir ? name.lastIndexOf('.') : -1;
    const baseCopyName = dot > 0 ? `${name.slice(0, dot)} copy${name.slice(dot)}` : `${name} copy`;
    try {
      const finalName = await withCollisionRetry(
        (candidate) => api.files.copy(scope, path, joinPath(parent, candidate)),
        baseCopyName
      );
      tickRef.current += 1;
      setChangeSignal({ paths: [parent], tick: tickRef.current });
      announce(`Duplicated as ${finalName}`);
    } catch (err) {
      announce(`Duplicate failed: ${(err as Error).message}`);
    }
  }, [scope]);

  const handleCutEntry = useCallback((path: string, isDir: boolean) => {
    setClipboard({ path, isDir, mode: 'cut' });
    announce(`Cut ${path.split('/').pop()}`);
  }, []);

  const handleCopyEntry = useCallback((path: string, isDir: boolean) => {
    setClipboard({ path, isDir, mode: 'copy' });
    announce(`Copied ${path.split('/').pop()}`);
  }, []);

  const handlePasteInto = useCallback(async (destDir: string) => {
    if (!scope || !clipboard) return;
    const name = clipboard.path.split('/').pop() ?? '';
    const sourceParent = parentOf(clipboard.path);
    const samePlace = destDir === sourceParent;

    try {
      if (clipboard.mode === 'copy') {
        const baseName = samePlace
          ? (() => {
              const dot = !clipboard.isDir ? name.lastIndexOf('.') : -1;
              return dot > 0 ? `${name.slice(0, dot)} copy${name.slice(dot)}` : `${name} copy`;
            })()
          : name;
        const finalName = await withCollisionRetry(
          (candidate) => api.files.copy(scope, clipboard.path, joinPath(destDir, candidate)),
          baseName
        );
        tickRef.current += 1;
        setChangeSignal({ paths: [destDir], tick: tickRef.current });
        announce(`Pasted ${finalName}`);
        return;
      }

      if (samePlace) { announce('Already in this folder'); return; }
      const finalName = await withCollisionRetry(
        (candidate) => api.files.rename(scope, clipboard.path, joinPath(destDir, candidate)),
        name
      );
      remapOpenFiles(clipboard.path, joinPath(destDir, finalName), clipboard.isDir);
      setClipboard(null);
      tickRef.current += 1;
      setChangeSignal({ paths: [sourceParent, destDir], tick: tickRef.current });
      announce(`Moved to ${destDir}`);
    } catch (err) {
      announce(`Paste failed: ${(err as Error).message}`);
    }
  }, [scope, clipboard, remapOpenFiles]);

  const handleDelete = useCallback(async () => {
    if (!scope || !deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.files.delete(scope, deleteTarget.path, deleteTarget.isDir);
      if (openFiles[deleteTarget.path]) doCloseFile(deleteTarget.path);
      const parent = parentOf(deleteTarget.path);
      setClipboard((c) => (c && (c.path === deleteTarget.path || (deleteTarget.isDir && c.path.startsWith(`${deleteTarget.path}/`))) ? null : c));
      tickRef.current += 1;
      setChangeSignal({ paths: [parent], tick: tickRef.current });
      setDeleteTarget(null);
    } catch (err) {
      announce(`Failed to delete: ${(err as Error).message}`);
    } finally {
      setDeleteBusy(false);
    }
  }, [scope, deleteTarget, openFiles, doCloseFile]);

  // Sidebar / terminal-panel resize — plain pointer drag, no new dependency.
  const startSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + (ev.clientX - startX))));
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startTerminalResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = terminalHeight;
    const maxHeight = (containerRef.current?.clientHeight ?? 800) * TERMINAL_MAX_RATIO;
    const onMove = (ev: MouseEvent) => {
      setTerminalHeight(Math.min(maxHeight, Math.max(TERMINAL_MIN, startHeight - (ev.clientY - startY))));
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const openTabInfos = useMemo(
    () => Object.values(openFiles).map((f) => ({ path: f.path, dirty: f.content !== f.savedContent })),
    [openFiles]
  );
  const activeFile = activeFilePath ? openFiles[activeFilePath] : null;

  if (tabs.length === 0) {
    return (
      <EmptyState
        className="h-full"
        icon={<FolderTree size={32} strokeWidth={1.5} />}
        title="No active sessions"
        description="Connect to a local or SSH session first — the Explorer browses whatever that session can access."
      />
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      <div className="flex items-center gap-3 h-10 px-3 bg-surface1 border-b border-edge-subtle flex-shrink-0">
        <span className="text-meta text-ink-muted flex-shrink-0">Browsing</span>
        <Select
          aria-label="Session to browse"
          value={selectedTab?.id ?? ''}
          onChange={(e) => setSelectedTabId(e.target.value)}
          className="max-w-[260px]"
        >
          {tabs.map((t) => (
            <option key={t.id} value={t.id}>{t.title} — {t.tmuxSession}</option>
          ))}
        </Select>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => setShowTerminal((v) => !v)}>
          {showTerminal ? 'Hide terminal' : 'Show terminal'}
        </Button>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div style={{ width: sidebarWidth }} className="flex-shrink-0 border-r border-edge-subtle bg-surface1">
          {scope && (
            <FileTree
              key={scopeKey}
              scope={scope}
              rootPathRequest={rootPathRequest}
              activeFilePath={activeFilePath}
              onOpenFile={openFile}
              watch={watch}
              unwatch={unwatch}
              changeSignal={changeSignal}
              onCreateFile={(dir) => { setNewFileDialogDir(dir); setNewFileError(null); }}
              onCreateFolder={(dir) => { setNewFolderDialogDir(dir); setNewFolderError(null); }}
              onDeleteEntry={(path, isDir) => setDeleteTarget({ path, isDir })}
              onRenameEntry={handleRenameEntry}
              onDuplicateEntry={handleDuplicateEntry}
              clipboard={clipboard}
              onCutEntry={handleCutEntry}
              onCopyEntry={handleCopyEntry}
              onPasteInto={handlePasteInto}
            />
          )}
        </div>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <div onMouseDown={startSidebarResize} className="w-1 flex-shrink-0 cursor-col-resize hover:bg-accent/40 transition-colors" />

        <div className="flex-1 min-w-0 flex flex-col">
          <EditorTabs files={openTabInfos} activePath={activeFilePath} onSelect={setActiveFilePath} onClose={closeFile} />

          <div className="flex-1 min-h-0 relative bg-termbg">
            {!activeFile && (
              <EmptyState className="h-full" icon={<FolderTree size={28} strokeWidth={1.5} />} title="No file open" description="Pick a file from the explorer to view or edit it." />
            )}

            {Object.values(openFiles).map((file) => (
              <div key={file.path} className="absolute inset-0 flex flex-col" style={{ display: file.path === activeFilePath ? 'flex' : 'none' }}>
                {file.externalChange && (
                  <div className="flex items-center gap-2 px-3 h-8 bg-warning/10 border-b border-warning/30 text-meta text-warning flex-shrink-0">
                    <AlertTriangle size={13} strokeWidth={1.75} />
                    Changed on disk since you opened it.
                    <button type="button" className="underline" onClick={() => void loadFile(file.path)}>Reload</button>
                  </div>
                )}
                <div className="flex items-center gap-2 px-3 h-8 border-b border-edge-subtle flex-shrink-0">
                  <span className="flex-1 text-meta font-technical text-ink-muted truncate">{file.path}</span>
                  {file.error && <span className="text-meta text-danger">{file.error}</span>}
                  <IconButton
                    size="sm"
                    icon={<RotateCcw size={13} strokeWidth={1.75} />}
                    label="Discard changes and reload from disk"
                    onClick={() => void loadFile(file.path)}
                    disabled={file.loading || file.saving}
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    icon={<Save size={13} strokeWidth={1.75} />}
                    label="Save (Ctrl+S)"
                    onClick={() => void saveFile(file.path)}
                    disabled={file.saving || file.content === file.savedContent}
                  />
                </div>
                <div className="flex-1 min-h-0">
                  {file.loading && <div className="p-4 text-meta text-ink-muted">Loading…</div>}
                  {!file.loading && file.binary && (
                    <div className="p-4 text-meta text-ink-muted">Binary file — cannot be edited here.</div>
                  )}
                  {!file.loading && !file.binary && (
                    <CodeEditor
                      path={file.path}
                      initialContent={file.content}
                      onChange={(content) => updateContent(file.path, content)}
                      onSave={() => void saveFile(file.path)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showTerminal && selectedTab && (
        <>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
          <div onMouseDown={startTerminalResize} className="h-1 flex-shrink-0 cursor-row-resize hover:bg-accent/40 transition-colors" />
          <div style={{ height: terminalHeight }} className="flex-shrink-0 border-t border-edge-subtle">
            <XtermPane tabId={selectedTab.id} sessionId={selectedTab.sessionId} active chrome="window" title={selectedTab.title} />
          </div>
        </>
      )}

      <PromptDialog
        open={!!newFileDialogDir}
        title="New file"
        description={newFileDialogDir ? `in ${newFileDialogDir}` : undefined}
        placeholder="filename.ext"
        confirmLabel="Create"
        busyLabel="Creating…"
        busy={newFileBusy}
        error={newFileError}
        onConfirm={handleCreateFile}
        onCancel={() => setNewFileDialogDir(null)}
      />

      <PromptDialog
        open={!!newFolderDialogDir}
        title="New folder"
        description={newFolderDialogDir ? `in ${newFolderDialogDir}` : undefined}
        placeholder="folder-name"
        confirmLabel="Create"
        busyLabel="Creating…"
        busy={newFolderBusy}
        error={newFolderError}
        onConfirm={handleCreateFolder}
        onCancel={() => setNewFolderDialogDir(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget?.isDir ? 'Delete folder?' : 'Delete file?'}
        description={deleteTarget ? `"${deleteTarget.path}" will be permanently removed. This can't be undone.` : ''}
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!closeConfirmPath}
        title="Discard unsaved changes?"
        description={closeConfirmPath ? `"${closeConfirmPath}" has unsaved changes that will be lost.` : ''}
        confirmLabel="Discard and close"
        busy={false}
        onConfirm={() => { if (closeConfirmPath) doCloseFile(closeConfirmPath); setCloseConfirmPath(null); }}
        onCancel={() => setCloseConfirmPath(null)}
      />
    </div>
  );
}
