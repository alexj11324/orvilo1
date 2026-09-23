import { describe, expect, it } from 'vitest';

import { draftCardTitle, draftExcerpt, issueDraftCardTitle } from './draftCardTitle';

const document = (children: unknown[]) => ({ root: { children, type: 'root' } });
const paragraph = (children: unknown[]) => ({ children, type: 'paragraph' });
const text = (value: string) => ({ text: value, type: 'text' });

const draft = {
  content: 'fallback content',
  editorData: null,
  taskIdentifier: 'PTP-1',
  taskName: 'Synthetic parity issue',
};

describe('draftExcerpt', () => {
  it('reads the first block of a wrapped editor document', () => {
    const editorData = {
      document: document([paragraph([text('Review local-first'), text(' guarantees')])]),
      version: 1,
    };
    expect(draftExcerpt(editorData)).toBe('Review local-first guarantees');
  });

  it('skips empty leading blocks and flattens link children', () => {
    const editorData = document([
      paragraph([]),
      paragraph([{ children: [text('DAY123-79')], type: 'link' }, text(' follow-up')]),
    ]);
    expect(draftExcerpt(editorData)).toBe('DAY123-79 follow-up');
  });

  it('uses decorator labels for custom leaf nodes', () => {
    expect(
      draftExcerpt(
        document([
          paragraph([{ name: 'report.md', path: '/tmp/report.md', type: 'local-file-tag' }]),
        ]),
      ),
    ).toBe('report.md');
    expect(
      draftExcerpt(
        document([paragraph([{ label: 'Member', metadata: {}, type: 'mention' }, text(' hi')])]),
      ),
    ).toBe('Member hi');
    expect(
      draftExcerpt(
        document([paragraph([{ topicId: 't1', topicTitle: 'Spec topic', type: 'refer-topic' }])]),
      ),
    ).toBe('Spec topic');
  });

  it('returns null when the document carries no text', () => {
    expect(draftExcerpt(document([paragraph([])]))).toBeNull();
    expect(draftExcerpt(null)).toBeNull();
    expect(draftExcerpt({ version: 1, document: null })).toBeNull();
  });
});

describe('draftCardTitle', () => {
  it('leads with the draft excerpt, not the issue name (reference parity)', () => {
    const editorData = document([paragraph([text('Review local-first guarantees')])]);
    expect(draftCardTitle({ ...draft, editorData }, 'Attachment')).toBe(
      'Review local-first guarantees',
    );
  });

  it('falls back to the first content line for legacy text drafts', () => {
    expect(draftCardTitle({ ...draft, content: '\nfirst line\nsecond line' }, 'Attachment')).toBe(
      'first line',
    );
  });

  it('falls back to the attachment label when the draft has no text', () => {
    expect(draftCardTitle({ ...draft, content: '' }, 'Attachment')).toBe('Attachment');
  });
});

describe('issueDraftCardTitle', () => {
  const labels = { attachment: 'Attachment', untitled: 'Untitled' };

  it('leads with the draft title field', () => {
    expect(
      issueDraftCardTitle(
        { content: 'body text', hasAttachments: false, title: '  Ship parity  ' },
        labels,
      ),
    ).toBe('Ship parity');
  });

  it('falls back to the body excerpt when the title is blank', () => {
    const editorData = document([paragraph([text('Body first line')])]);
    expect(
      issueDraftCardTitle({ content: '', editorData, hasAttachments: false, title: '' }, labels),
    ).toBe('Body first line');
    expect(
      issueDraftCardTitle({ content: '\ncontent line', hasAttachments: false, title: ' ' }, labels),
    ).toBe('content line');
  });

  it('uses the attachment label for attachment-only drafts, else untitled', () => {
    expect(issueDraftCardTitle({ content: '', hasAttachments: true, title: '' }, labels)).toBe(
      'Attachment',
    );
    expect(issueDraftCardTitle({ content: '', hasAttachments: false, title: '' }, labels)).toBe(
      'Untitled',
    );
  });
});
