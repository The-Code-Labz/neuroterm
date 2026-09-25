import { useRef } from 'react';
import { X, File as FileIcon, Circle } from 'lucide-react';
import Tooltip from '../ui/Tooltip';

export interface EditorTabInfo {
  path: string;
  dirty: boolean;
}

interface EditorTabsProps {
  files: EditorTabInfo[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

export default function EditorTabs({ files, activePath, onSelect, onClose }: EditorTabsProps): JSX.Element {
  const stripRef = useRef<HTMLDivElement>(null);

  const onWheel = (e: React.WheelEvent) => {
    if (e.deltaY === 0 || !stripRef.current) return;
    stripRef.current.scrollLeft += e.deltaY;
  };

  if (files.length === 0) {
    return (
      <div className="flex items-center h-8 px-3 bg-surface1 border-b border-edge-subtle">
        <span className="text-meta text-ink-muted">No open files — select one from the explorer</span>
      </div>
    );
  }

  return (
    <div
      ref={stripRef}
      onWheel={onWheel}
      role="tablist"
      aria-label="Open files"
      className="flex items-stretch h-8 bg-surface1 border-b border-edge-subtle overflow-x-auto flex-shrink-0"
    >
      {files.map((file) => {
        const isActive = file.path === activePath;
        const name = file.path.split('/').pop() || file.path;
        return (
          <div
            key={file.path}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(file.path)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(file.path); } }}
            title={file.path}
            className={`group relative flex items-center gap-1.5 px-2.5 min-w-[120px] max-w-[200px] cursor-pointer select-none border-r border-edge-subtle transition-colors duration-140 ${
              isActive ? 'bg-surface2 text-ink-strong' : 'bg-surface1 text-ink-secondary hover:bg-surface2/60 hover:text-ink'
            }`}
          >
            {isActive && <span className="absolute top-0 left-0 right-0 h-0.5 bg-accent" aria-hidden="true" />}
            <FileIcon size={12} strokeWidth={1.75} className="flex-shrink-0" />
            <span className="flex-1 min-w-0 truncate text-meta font-technical">{name}</span>
            {file.dirty && <Circle size={7} fill="currentColor" strokeWidth={0} className="flex-shrink-0 text-accent" aria-label="Unsaved changes" />}
            <Tooltip label="Close file">
              <button
                type="button"
                tabIndex={isActive ? 0 : -1}
                onClick={(e) => { e.stopPropagation(); onClose(file.path); }}
                className={`flex-shrink-0 p-0.5 rounded transition-colors duration-140 hover:bg-danger/10 hover:text-danger ${
                  isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                }`}
                aria-label={`Close ${name}`}
              >
                <X size={12} strokeWidth={1.75} />
              </button>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}
