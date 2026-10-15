import { describe, expect, it } from 'vitest';

import { bindEmojiPickerTheme } from './shadowTheme';

const pickerHost = () => {
  const host = document.createElement('em-emoji-picker');
  host.attachShadow({ mode: 'open' });
  return host;
};

describe('Emoji Mart theme bridge lifecycle', () => {
  it('binds asynchronously mounted hosts and restores existing inline priorities on cleanup', async () => {
    const container = document.createElement('div');
    const cleanup = bindEmojiPickerTheme(container, { '--rgb-accent': '2, 3, 4' }, false);
    const host = pickerHost();
    host.style.setProperty('--rgb-accent', '1, 1, 1', 'important');
    host.setAttribute('data-orvilo-motion-disabled', 'preexisting');
    container.append(host);
    await Promise.resolve();

    expect(host.style.getPropertyValue('--rgb-accent')).toBe('2, 3, 4');
    expect(host.shadowRoot?.querySelectorAll('style')).toHaveLength(1);
    cleanup();
    expect(host.style.getPropertyValue('--rgb-accent')).toBe('1, 1, 1');
    expect(host.style.getPropertyPriority('--rgb-accent')).toBe('important');
    expect(host.getAttribute('data-orvilo-motion-disabled')).toBe('preexisting');
    expect(host.shadowRoot?.querySelectorAll('style')).toHaveLength(0);

    const later = pickerHost();
    container.append(later);
    await Promise.resolve();
    expect(later.style.getPropertyValue('--rgb-accent')).toBe('');
    expect(later.shadowRoot?.querySelectorAll('style')).toHaveLength(0);
  });

  it('supports effect replay and motion changes without duplicate shadow sheets or stale flags', () => {
    const container = document.createElement('div');
    const host = pickerHost();
    container.append(host);
    const first = bindEmojiPickerTheme(container, { '--rgb-background': '1, 2, 3' }, false);
    expect(host.hasAttribute('data-orvilo-motion-disabled')).toBe(true);
    first();
    const second = bindEmojiPickerTheme(container, { '--rgb-background': '4, 5, 6' }, true);
    expect(host.hasAttribute('data-orvilo-motion-disabled')).toBe(false);
    expect(host.style.getPropertyValue('--rgb-background')).toBe('4, 5, 6');
    expect(host.shadowRoot?.querySelectorAll('style')).toHaveLength(1);
    second();
    expect(host.style.getPropertyValue('--rgb-background')).toBe('');
    expect(host.shadowRoot?.querySelectorAll('style')).toHaveLength(0);
  });
});
