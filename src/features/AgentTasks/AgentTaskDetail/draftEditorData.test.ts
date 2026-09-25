import { describe, expect, it } from 'vitest';

import { getFileIdForUrl, registerAttachment } from '@/features/EditorCanvas/attachmentRegistry';

import { packDraftEditorData, unpackDraftEditorData } from './draftEditorData';

describe('draft editor attachment persistence', () => {
  it('stores the URL and file ID mapping with the rich editor document', () => {
    const url = 'https://example.test/draft-attachment-1';
    registerAttachment(url, 'file-123');
    const document = { root: { children: [{ fileUrl: url, type: 'file' }] } };

    expect(packDraftEditorData(document)).toEqual({
      attachments: [{ downloadUrl: undefined, id: 'file-123', url }],
      document,
      version: 1,
    });
  });

  it('seeds attachment IDs before restoring a draft in a new session', () => {
    const url = 'https://example.test/draft-attachment-2';
    const document = { root: { children: [{ fileUrl: url, type: 'file' }] } };
    expect(getFileIdForUrl(url)).toBeUndefined();

    const restored = unpackDraftEditorData({
      attachments: [{ id: 'file-456', url }],
      document,
      version: 1,
    });
    expect(restored.document).toEqual(document);
    expect(getFileIdForUrl(url)).toBe('file-456');
  });
});
