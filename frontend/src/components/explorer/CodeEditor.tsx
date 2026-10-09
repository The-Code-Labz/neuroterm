import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { selectSelectionMatches } from '@codemirror/search';
import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { fieldConsoleEditorTheme } from './editorTheme';

interface CodeEditorProps {
  path: string;
  initialContent: string;
  onChange: (content: string) => void;
  onSave: () => void;
}

const languageCompartment = new Compartment();

// One persistent CodeMirror instance per open file — same "all mounted,
// toggle display:none" pattern XtermPane uses for terminal tabs, so
// switching between open files keeps each one's undo history, cursor, and
// scroll position instead of losing it on every tab switch.
export default function CodeEditor({ path, initialContent, onChange, onSave }: CodeEditorProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!containerRef.current) return;

    // basicSetup's defaultKeymap/searchKeymap already cover most VS Code
    // muscle memory (Mod-d select-next-occurrence, Ctrl/Cmd-Alt-Up/Down add
    // cursor above/below, Alt-Up/Down move line, Shift-Alt-Up/Down duplicate
    // line, Escape simplify-selection). The one VS Code staple missing —
    // "select every occurrence of the current word/selection at once" so
    // typing replaces them all (no LSP rename available here) — is F2 here,
    // since real rename-symbol doesn't apply without a language server.
    // Mod-Shift-l mirrors VS Code's own binding for the same action.
    const vscodeKeymap = keymap.of([
      { key: 'F2', preventDefault: true, run: selectSelectionMatches },
      { key: 'Mod-Shift-l', preventDefault: true, run: selectSelectionMatches },
    ]);

    const saveKeymap = keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => { onSaveRef.current(); return true; } },
      indentWithTab,
    ]);

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        basicSetup,
        vscodeKeymap,
        saveKeymap,
        fieldConsoleEditorTheme,
        languageCompartment.of([]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });

    // Language support loads async (dynamically imported per-language by
    // @codemirror/language-data) and is installed once ready — the editor
    // is usable immediately, syntax highlighting just arrives a beat later.
    const desc = LanguageDescription.matchFilename(languages, path);
    if (desc) {
      desc.load()
        .then((support) => view.dispatch({ effects: languageCompartment.reconfigure(support) }))
        .catch(() => { /* unsupported/failed language load — plain text is fine */ });
    }

    return () => view.destroy();
    // `path` never changes across this instance's lifetime — each open file
    // gets its own CodeEditor instance (see ExplorerWorkspace), so this only
    // ever runs once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="h-full w-full overflow-auto" />;
}
