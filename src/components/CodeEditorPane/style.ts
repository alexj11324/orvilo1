// Chrome uses the compat wrapper's public constructor.theme API. Keep its
// constructor/base-theme identity: extensions from another CodeMirror bundle
// cannot safely be mixed into this editor.
interface ThemeConstructor {
  theme: (spec: unknown, config: { dark: boolean }) => unknown;
}

interface ChromePreferences {
  dark: boolean;
}

// StyleModule themes are allocations. Two public dark variants per actual
// constructor/base identity suffice; live motion is inherited from CSS tokens.
const themes = new WeakMap<ThemeConstructor, WeakMap<object, Map<boolean, unknown>>>();

const chromeTheme = {
  '&.cm-editor.cm-editor': {
    height: '100%',
    paddingBlock: 0,
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontSize: '0.875rem',
    fontVariantLigatures: 'none',
    lineHeight: 'calc(22 / 14)',
  },
  '&.cm-editor.cm-editor span, &.cm-editor.cm-editor .cm-line': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.875rem',
    lineHeight: 'calc(22 / 14)',
  },
  '.cm-content': {
    minHeight: '100%',
    paddingBlock: 'calc(var(--spacing) * 2)',
  },
  '.cm-gutters': {
    userSelect: 'none',
    borderInlineEnd: 'calc(var(--spacing) * 0.25) solid var(--divider)',
    background: 'var(--card)',
  },
  '&.cm-editor.cm-editor .cm-line': {
    paddingInline: 'calc(var(--spacing) * 1.5) calc(var(--spacing) * 3)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: 'calc(var(--spacing) * 5.5)',
    paddingInline: 'calc(var(--spacing) * 4) calc(var(--spacing) * 0.5)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 'calc(20 / 12)',
    color: 'var(--foreground-quaternary)',
  },
  '&.cm-editor.cm-editor .cm-activeLineGutter': {
    // Direct, qualified foreground wins the ordinary gutter-number rule;
    // inherited gutter color does not require an important declaration.
    color: 'var(--foreground)',
    background: 'transparent',
  },
  '&.cm-editor.cm-editor .cm-activeLine': {
    background: 'var(--fill-quaternary)',
  },
  '&.cm-editor.cm-editor:not(.cm-focused) .cm-activeLine': {
    background: 'transparent',
  },
  '.cm-matchingBracket, &.cm-editor.cm-focused .cm-matchingBracket': {
    borderRadius: 'var(--radius-chip)',
    background: 'var(--selected)',
    outline: 'calc(var(--spacing) * 0.25) solid var(--border)',
  },
  '.cm-nonmatchingBracket': {
    borderRadius: 'var(--radius-chip)',
    background: 'var(--destructive-wash)',
  },
  '.gutter-fold-open, .gutter-fold-close': {
    'cursor': 'pointer',
    'display': 'flex',
    'alignItems': 'center',
    'justifyContent': 'center',
    'width': 'calc(var(--spacing) * 4)',
    'height': '1.375rem',
    'color': 'var(--foreground-tertiary)',
    // AppTheme live token.motion:false makes this public role 0s; system
    // reduction also stops it below. No render-time user store bridge needed.
    'transition': 'opacity var(--orvilo-motion-mid)',
    '&::before': {
      content: "''",
      width: 'calc(var(--spacing) * 1.25)',
      height: 'calc(var(--spacing) * 1.25)',
      borderBlockEnd: 'calc(var(--spacing) * 0.35) solid currentcolor',
      borderInlineEnd: 'calc(var(--spacing) * 0.35) solid currentcolor',
    },
  },
  '.gutter-fold-open': {
    'opacity': 1,
    '&::before': {
      transform: 'translateY(calc(var(--spacing) * -0.25)) rotate(45deg)',
    },
  },
  '.gutter-fold-close::before': {
    transform: 'translateX(calc(var(--spacing) * -0.5)) rotate(-45deg)',
  },
  '.gutter-fold-open:hover, .gutter-fold-close:hover': {
    color: 'var(--foreground)',
  },
  '@media (hover: hover) and (pointer: fine)': {
    '.gutter-fold-open': { opacity: 0 },
    '.cm-gutters:hover .gutter-fold-open, &.cm-focused .gutter-fold-open': { opacity: 1 },
  },
  '&.cm-editor.cm-editor .cm-foldPlaceholder': {
    width: 'auto',
    height: 'auto',
    paddingInline: 'calc(var(--spacing) * 1.5)',
    border: 'calc(var(--spacing) * 0.25) solid var(--divider)',
    borderRadius: 'var(--radius-chip)',
    fontSize: '0.75rem',
    lineHeight: 'calc(20 / 12)',
    color: 'var(--foreground-tertiary)',
    background: 'var(--muted)',
  },
  '@media (prefers-reduced-motion: reduce)': {
    '.gutter-fold-open, .gutter-fold-close': { transition: 'none' },
  },
};

export const getCodeEditorTheme = (
  constructor: ThemeConstructor,
  baseTheme: object,
  { dark }: ChromePreferences,
) => {
  let bases = themes.get(constructor);
  if (!bases) themes.set(constructor, (bases = new WeakMap()));
  let variants = bases.get(baseTheme);
  if (!variants) bases.set(baseTheme, (variants = new Map()));
  const key = dark;
  if (!variants.has(key)) {
    // Unique chrome selectors keep every original lobeTheme root/grammar key.
    variants.set(key, constructor.theme({ ...baseTheme, ...chromeTheme }, { dark }));
  }
  return variants.get(key);
};

export const styles = {
  container:
    'flex h-full w-full flex-col overflow-hidden bg-card [&_.cm-textarea]:h-0 [&_.cm-textarea]:opacity-0',
  editorArea: 'flex-1 min-h-0 overflow-hidden',
};
