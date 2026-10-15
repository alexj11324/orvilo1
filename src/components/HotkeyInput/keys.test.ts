import { describe, expect, it } from 'vitest';

import { canonicalShortcut, shortcutFromEvent, shortcutLabel } from './keys';

const event = (overrides = {}) => ({
  altKey: false,
  code: 'KeyK',
  ctrlKey: false,
  key: 'k',
  metaKey: false,
  shiftKey: false,
  ...overrides,
});
describe('local hotkey capture contract', () => {
  it('maps the platform primary modifier to mod and preserves secondary modifiers', () => {
    expect(shortcutFromEvent(event({ ctrlKey: true, shiftKey: true }), false)).toBe('mod+shift+k');
    expect(shortcutFromEvent(event({ metaKey: true, altKey: true }), true)).toBe('mod+alt+k');
    expect(shortcutFromEvent(event({ ctrlKey: true }), true)).toBe('ctrl+k');
  });
  it('never saves ordinary typing, modifiers alone or composition keys as a shortcut', () => {
    expect(shortcutFromEvent(event(), false)).toBeUndefined();
    expect(shortcutFromEvent(event({ ctrlKey: true, key: 'Control' }), false)).toBeUndefined();
    expect(shortcutFromEvent(event({ ctrlKey: true, key: 'Process' }), false)).toBeUndefined();
  });
  it('uses physical code for shifted punctuation and normalizes conflict aliases/order', () => {
    expect(
      shortcutFromEvent(event({ ctrlKey: true, code: 'Comma', key: '<', shiftKey: true }), false),
    ).toBe('mod+shift+comma');
    expect(canonicalShortcut('Shift+Control+K', false)).toBe(
      canonicalShortcut('mod+shift+k', false),
    );
    expect(canonicalShortcut('Command+K', true)).toBe(canonicalShortcut('mod+k', true));
    expect(canonicalShortcut('ctrl++', false)).toBe('mod+equal');
    expect(shortcutFromEvent(event({ ctrlKey: true, code: 'NumpadAdd', key: '+' }), false)).toBe(
      'mod+equal',
    );
  });
  it('shows the same saved key using the platform display vocabulary', () => {
    expect(shortcutLabel('mod+shift+k', true)).toBe('⌘ ⇧ K');
    expect(shortcutLabel('mod+shift+k', false)).toBe('Ctrl + Shift + K');
  });
});
