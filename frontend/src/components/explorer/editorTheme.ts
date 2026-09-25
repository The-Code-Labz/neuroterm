import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// Field Console tokens (see index.css --terminal-bg/--bg-canvas/--accent
// etc.) reused here rather than CodeMirror's bundled themes, so the editor
// matches the rest of the app instead of importing a second, unrelated
// dark palette.
const theme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--terminal-bg)',
      color: 'var(--text-primary)',
      height: '100%',
      fontSize: '13px',
    },
    '.cm-content': {
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      caretColor: 'var(--accent-hover)',
      padding: '8px 0',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent-hover)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(103, 199, 184, 0.24)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--terminal-bg)',
      color: 'var(--text-muted)',
      border: 'none',
      borderRight: '1px solid var(--border-subtle)',
    },
    '.cm-activeLineGutter, .cm-activeLine': {
      backgroundColor: 'rgba(103, 199, 184, 0.06)',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--surface-2)',
      border: '1px solid var(--border-default)',
      color: 'var(--text-secondary)',
    },
    '.cm-searchMatch': {
      backgroundColor: 'rgba(227, 183, 102, 0.25)',
      outline: '1px solid var(--warning)',
    },
    '.cm-searchMatch-selected': {
      backgroundColor: 'rgba(103, 199, 184, 0.35)',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
      backgroundColor: 'rgba(103, 199, 184, 0.18)',
      outline: '1px solid var(--accent)',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--surface-2)',
      border: '1px solid var(--border-default)',
      color: 'var(--text-primary)',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'var(--surface-3)',
      color: 'var(--text-strong)',
    },
  },
  { dark: true }
);

const highlightStyle = HighlightStyle.define([
  { tag: t.comment, color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: '#B998D6' },
  { tag: [t.string, t.special(t.string)], color: '#8FCB8F' },
  { tag: [t.number, t.bool, t.null], color: '#E5C07B' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#7AA2D6' },
  { tag: [t.definition(t.variableName), t.definition(t.propertyName)], color: 'var(--text-strong)' },
  { tag: t.variableName, color: 'var(--text-primary)' },
  { tag: t.propertyName, color: '#6FC3BE' },
  { tag: [t.typeName, t.className], color: '#6FC3BE' },
  { tag: t.operator, color: 'var(--text-secondary)' },
  { tag: t.punctuation, color: 'var(--text-secondary)' },
  { tag: t.tagName, color: '#E78284' },
  { tag: t.attributeName, color: '#E5C07B' },
  { tag: t.invalid, color: 'var(--danger)' },
  { tag: t.link, color: 'var(--accent)', textDecoration: 'underline' },
]);

export const fieldConsoleEditorTheme = [theme, syntaxHighlighting(highlightStyle)];
