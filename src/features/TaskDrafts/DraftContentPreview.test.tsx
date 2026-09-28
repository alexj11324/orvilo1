/** @vitest-environment happy-dom */
import { moment } from '@lobehub/editor';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import DraftContentPreview from './DraftContentPreview';

const document = {
  root: {
    children: [
      {
        children: [
          {
            isDirectory: false,
            name: 'report.md',
            path: '/tmp/report.md',
            type: 'local-file-tag',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
};

afterEach(cleanup);

describe('DraftContentPreview', () => {
  it('renders a saved comment containing a custom local-file node', async () => {
    const { container } = render(
      <DraftContentPreview
        attachmentLabel="Attachment"
        content="report.md"
        editorData={{ attachments: [], document, version: 1 }}
      />,
    );

    await act(async () => {
      await moment();
    });

    expect(container.textContent).toContain('report.md');
  });
});
