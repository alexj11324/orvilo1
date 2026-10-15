import { describe, expect, it, vi } from 'vitest';

import { readOwnedMarkdownForExport } from './ownedMarkdownExport';

describe('agent document menu owned Markdown export', () => {
  it('exports the current owner document through its actual read port', () => {
    const getDocument = vi.fn((type: string) =>
      type === 'markdown' ? '# Current draft' : undefined,
    );
    expect(
      readOwnedMarkdownForExport('doc-a', () => ({
        activeDocumentId: 'doc-a',
        editor: { getDocument },
      })),
    ).toBe('# Current draft');
    expect(getDocument).toHaveBeenCalledTimes(1);
    expect(getDocument).toHaveBeenCalledWith('markdown');
  });

  it('preserves a cleared document as a valid empty Markdown export', () => {
    expect(
      readOwnedMarkdownForExport('doc-a', () => ({
        activeDocumentId: 'doc-a',
        editor: { getDocument: () => '' },
      })),
    ).toBe('');
  });

  it('reads ownership when invoked and does not export the next page from a stale menu', () => {
    const originalRead = vi.fn(() => 'Original draft');
    const nextRead = vi.fn(() => 'Other document');
    let state = { activeDocumentId: 'doc-a', editor: { getDocument: originalRead } };
    // This closure is the same menu action before and after navigation.
    const exportFromOpenMenu = () => readOwnedMarkdownForExport('doc-a', () => state);
    expect(exportFromOpenMenu()).toBe('Original draft');
    state = { activeDocumentId: 'doc-b', editor: { getDocument: nextRead } };
    expect(exportFromOpenMenu()).toBeUndefined();
    expect(originalRead).toHaveBeenCalledTimes(1);
    expect(nextRead).not.toHaveBeenCalled();
  });

  it('does not read an unavailable owner', () => {
    expect(
      readOwnedMarkdownForExport('doc-a', () => ({ activeDocumentId: 'doc-a' })),
    ).toBeUndefined();
  });

  it('propagates malformed output and read failures to the menu error handler', () => {
    expect(() =>
      readOwnedMarkdownForExport('doc-a', () => ({
        activeDocumentId: 'doc-a',
        editor: { getDocument: () => ({ root: {} }) },
      })),
    ).toThrow('Markdown export unavailable');
    const failure = new Error('Codec unavailable');
    expect(() =>
      readOwnedMarkdownForExport('doc-a', () => ({
        activeDocumentId: 'doc-a',
        editor: {
          getDocument: () => {
            throw failure;
          },
        },
      })),
    ).toThrow(failure);
  });
});
