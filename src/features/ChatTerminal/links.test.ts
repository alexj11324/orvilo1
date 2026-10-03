import { beforeEach, describe, expect, it, vi } from 'vitest';

import { openTerminalLink } from './links';

const { openExternal } = vi.hoisted(() => ({
  openExternal: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/platform', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getHostPort: () => ({ openExternal }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('openTerminalLink', () => {
  it('hands http(s) links to the system browser', () => {
    openTerminalLink('https://orvilo.aspectlylabs.com/docs?a=1#x');

    expect(openExternal).toHaveBeenCalledWith('https://orvilo.aspectlylabs.com/docs?a=1#x');
  });

  it.each(['file:///etc/passwd', 'vscode://x', 'javascript:alert(1)', 'mailto:a@b.com'])(
    'refuses to open %s — terminal output is attacker-reachable and the main process does no check',
    (uri) => {
      openTerminalLink(uri);

      expect(openExternal).not.toHaveBeenCalled();
    },
  );

  it('ignores text that is not a URL at all', () => {
    openTerminalLink('not a link');

    expect(openExternal).not.toHaveBeenCalled();
  });
});
