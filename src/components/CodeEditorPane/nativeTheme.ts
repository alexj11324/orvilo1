// Adapted from @lobehub/editor4.29.2 codemirror/theme.ts (MIT).
// Preserve its grammar classes; use owned roles and exact owned palette steps.
import palettes from '@/styles/nativeThemePalettes.json';

function grammarTheme(appearance: 'dark' | 'light') {
  const tokens = {
    colorPrimary: 'var(--primary)',
    colorBgContainer: 'var(--card)',
    colorTextQuaternary: 'var(--foreground-quaternary)',
    purple10: palettes.purple[appearance][10],
    volcano10: palettes.volcano[appearance][10],
    geekblue10: palettes.geekblue[appearance][10],
    colorInfo: 'var(--info)',
    colorText: 'var(--foreground)',
    colorWarning: 'var(--warning)',
    colorSuccess: 'var(--success)',
    colorFillSecondary: 'var(--selected)',
    fontFamilyCode: 'var(--font-mono)',
    colorPrimaryBg: 'var(--primary-wash)',
    yellow: palettes.yellow[appearance][9],
  };
  return {
    '&': {
      '& .cm-cursor': { 'border-left-color': tokens.colorPrimary },
      '& .cm-cursor.cm-cursor-primary': {
        'border-inline-start': `2px solid ${tokens.colorPrimary} !important`,
      },
      '& .cm-gutters': {
        'background-color': tokens.colorBgContainer,
        'border': 'none',
        'color': tokens.colorTextQuaternary,
        'cursor': 'default',
      },
      '& .cm-line': {
        '& .cm-atom': { color: tokens.purple10 },
        '& .cm-attribute': { color: tokens.purple10 },
        '& .cm-builtin': {
          color: tokens.volcano10,
          fontStyle: 'italic',
        },
        '& .cm-comment': {
          color: tokens.colorTextQuaternary,
          fontStyle: 'italic',
        },
        '& .cm-foldPlaceholder': {
          'background': `url("data:image/svg+xml,%3Csvg width='16' height='16' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Crect fill='%23E8E8E8' width='16' height='16' rx='2'/%3E%3Cpath d='M2.75 7.984a.875.875 0 1 0 1.75 0 .875.875 0 0 0-1.75 0Zm4.375 0a.875.875 0 1 0 1.75 0 .875.875 0 0 0-1.75 0Zm4.375 0a.875.875 0 1 0 1.75 0 .875.875 0 0 0-1.75 0Z' fill='%232A3238'/%3E%3C/g%3E%3C/svg%3E") no-repeat`,
          'border': 'none',
          'color': 'transparent',
          'display': 'inline-block',
          'height': '16px',
          'padding': 0,
          'vertical-align': 'middle',
          'width': '16px',
        },
        '& .cm-function': { color: tokens.geekblue10 },
        '& .cm-header': { color: tokens.colorInfo },
        '& .cm-keyword': { color: tokens.colorInfo },
        '& .cm-meta': { color: tokens.colorText },
        '& .cm-modifier': { color: tokens.colorInfo },
        '& .cm-number': { color: tokens.volcano10 },
        '& .cm-operator': { color: tokens.colorInfo },
        '& .cm-property': { color: tokens.volcano10 },
        '& .cm-punctuation': { color: tokens.colorInfo },
        '& .cm-qualifier': { color: tokens.colorWarning },
        '& .cm-string': { color: tokens.colorSuccess },
        '& .cm-string-2': { color: tokens.colorSuccess },
        '& .cm-tag': { color: tokens.volcano10 },
        '& .cm-tag.cm-bracket': { color: tokens.colorInfo },
        '& .cm-type': { color: tokens.colorWarning },
        '& .cm-variable': { color: tokens.colorText },
        '& .cm-variable-2': { color: tokens.geekblue10 },
        '& .cm-variable-3': { color: tokens.colorWarning },
        '& .cm-variable.cm-callee': { color: tokens.geekblue10 },
        '& .cm-variable.cm-def': { color: tokens.colorText },
        'color': tokens.colorText,
        'padding-inline': '12px',
      },
    },
    '& .cm-selectionBackground': { background: 'transparent' },
    '& .cm-selectionMatch': { background: `${tokens.colorFillSecondary} !important` },
    '&.cm-editor': {
      'background': 'transparent',
      'cursor': 'text',
      'padding-block': '12px',
      'width': '100%',
    },
    '&.cm-editor span': {
      'font-family': tokens.fontFamilyCode,
      'font-size': 'calc(var(--lobe-markdown-font-size) * 0.8)',
    },
    '&.cm-editor.cm-focused .cm-selectionBackground': { background: tokens.colorPrimaryBg },
    '&.cm-editor.cm-focused .cm-selectionLineGutter': { color: tokens.colorText },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
      background: tokens.yellow,
    },
  };
}

export const nativePaneGrammarThemes = { light: grammarTheme('light'), dark: grammarTheme('dark') };
