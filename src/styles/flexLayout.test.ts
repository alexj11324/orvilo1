import { afterEach, describe, expect, it } from 'vitest';

import { flexLayout } from './flexLayout';

const sheets: HTMLStyleElement[] = [];
const mountStyle = (text: string) => {
  const sheet = document.createElement('style');
  sheet.textContent = text;
  document.head.append(sheet);
  sheets.push(sheet);
};

afterEach(() => {
  sheets.splice(0).forEach((sheet) => sheet.remove());
  document.body.replaceChildren();
});

describe('Flex layout padding with a late reset', () => {
  it('preserves declared padding when the universal reset loads after the UI theme', () => {
    mountStyle(flexLayout.styles);
    mountStyle('* { padding: 0; }');
    const element = document.createElement('div');
    element.className = 'lobe-flex';
    element.style.setProperty('--lobe-flex-padding', '8px');
    document.body.append(element);
    expect(getComputedStyle(element).paddingTop).toBe('8px');
    expect(getComputedStyle(element).paddingLeft).toBe('8px');
  });

  it('allows an explicit surface class to own its padding', () => {
    mountStyle('.surface { padding: 12px 24px; }');
    mountStyle(flexLayout.styles);
    const element = document.createElement('div');
    element.className = 'lobe-flex surface';
    document.body.append(element);
    expect(getComputedStyle(element).paddingLeft).toBe('24px');
  });
});
