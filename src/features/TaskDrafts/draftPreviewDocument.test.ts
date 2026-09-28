import { describe, expect, it } from 'vitest';

import { draftPreviewDocument } from './draftPreviewDocument';

describe('Drafts rich preview', () => {
  const richDocument = {
    root: {
      children: [{ children: [{ text: 'PTP-1', type: 'link' }], type: 'paragraph' }],
      type: 'root',
    },
  };

  it('shows the saved editor document from a current wrapped draft', () => {
    expect(
      draftPreviewDocument({
        attachments: [],
        document: richDocument,
        version: 1,
      }),
    ).toEqual(richDocument);
  });

  it('keeps the rich preview for a legacy unwrapped draft', () => {
    expect(draftPreviewDocument(richDocument)).toEqual(richDocument);
  });

  it('reads the JSON string saved by the editor API', () => {
    expect(draftPreviewDocument({ version: 1, document: JSON.stringify(richDocument) })).toEqual(
      richDocument,
    );
  });

  it('uses the text fallback when no valid editor document exists', () => {
    expect(draftPreviewDocument(null)).toBeNull();
    expect(draftPreviewDocument({ version: 1, document: null })).toBeNull();
  });
});
