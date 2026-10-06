import { getFilePathDisplayInfo } from '@orvilo/shared-tool-ui/components';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  initServerConfigStore,
  Provider as ServerConfigProvider,
} from '@/store/serverConfig/store';

import EditedFilesCard, {
  AGGREGATE_EDITED_FILE_ICON_SIZE,
  getEditedFileIconName,
  getEditedFilesCardMode,
  SINGLE_EDITED_FILE_ICON_SIZE,
} from './index';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { path?: string }) =>
      options?.path ? `${key}:${options.path}` : key,
  }),
}));

vi.mock('@orvilo/shared-tool-ui/components', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  FilePathDisplay: ({ filePath }: { filePath: string }) => createElement('span', null, filePath),
}));

const singleEntry = {
  diffTexts: [
    'diff --git a/Acceptance/index.tsx b/Acceptance/index.tsx\n--- a/Acceptance/index.tsx\n+++ b/Acceptance/index.tsx\n@@ -1 +1 @@\n-old\n+new',
  ],
  kind: 'modified' as const,
  linesAdded: 7,
  linesDeleted: 2,
  path: '/workspace/Acceptance/index.tsx',
  sandboxBacked: false,
  sourceToolCallIds: ['tool-1'],
};

describe('getEditedFilesCardMode', () => {
  it('uses the dedicated direct summary for a single edited file', () => {
    expect(getEditedFilesCardMode(1)).toBe('single');
  });

  it('uses the collapsible aggregate for multiple edited files', () => {
    expect(getEditedFilesCardMode(2)).toBe('aggregate');
  });
});

describe('getEditedFileIconName', () => {
  it('uses the edited file basename to select its file-type icon', () => {
    expect(getEditedFileIconName('/workspace/Acceptance/index.tsx')).toBe('index.tsx');
  });
});

describe('getFilePathDisplayInfo', () => {
  it('keeps the parent directory and basename for long absolute paths', () => {
    expect(getFilePathDisplayInfo('/very/long/workspace/Acceptance/index.tsx')).toEqual({
      displayPath: 'Acceptance/index.tsx',
      isImage: false,
      name: 'index.tsx',
    });
  });

  it('marks image files so they render a lucide image icon instead of a file-type icon', () => {
    expect(getFilePathDisplayInfo('/workspace/tmp/r24-studio-crop.PNG')).toEqual({
      displayPath: 'tmp/r24-studio-crop.PNG',
      isImage: true,
      name: 'r24-studio-crop.PNG',
    });
  });
});

describe('SINGLE_EDITED_FILE_ICON_SIZE', () => {
  it('matches the height of the two-line title block beside it', () => {
    expect(SINGLE_EDITED_FILE_ICON_SIZE).toBe(40);
  });
});

describe('AGGREGATE_EDITED_FILE_ICON_SIZE', () => {
  it('matches the single-file card so stacked cards share one icon scale', () => {
    expect(AGGREGATE_EDITED_FILE_ICON_SIZE).toBe(40);
  });
});

describe('SingleEditedFileCard', () => {
  it.each(['single', 'aggregate'])(
    'keeps semantic diff rows and both line numbers (%s)',
    async (mode) => {
      const user = userEvent.setup();
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
      const { container } = render(
        createElement(ServerConfigProvider, {
          children: createElement(EditedFilesCard, {
            entries:
              mode === 'single'
                ? [singleEntry]
                : [singleEntry, { ...singleEntry, path: '/workspace/other.ts' }],
          }),
          createStore: () => initServerConfigStore({}),
        }),
      );

      fireEvent.click(
        screen.getByRole('button', {
          name:
            mode === 'single' ? 'editedFiles.viewChanges' : /\/workspace\/Acceptance\/index.tsx/,
        }),
      );

      const removed = container.querySelector('[data-diff="remove"]');
      const added = container.querySelector('[data-diff="add"]');
      expect(removed).toHaveTextContent('old');
      expect(added).toHaveTextContent('new');
      expect(removed).toHaveAttribute('data-gutter', ' 1   ');
      expect(added).toHaveAttribute('data-gutter', '    1');
      expect(container.querySelector('[data-code-line-numbers]')).not.toBeNull();
      await user.click(screen.getByRole('button', { name: 'Copy code' }));
      expect(writeText).toHaveBeenCalledWith(singleEntry.diffTexts[0]);
    },
  );

  it('preserves readable metadata for a binary patch without diff rows', () => {
    const patch =
      'diff --git a/image.png b/image.png\nBinary files a/image.png and b/image.png differ';
    const { container } = render(
      createElement(ServerConfigProvider, {
        children: createElement(EditedFilesCard, {
          entries: [{ ...singleEntry, diffTexts: [patch] }],
        }),
        createStore: () => initServerConfigStore({}),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'editedFiles.viewChanges' }));
    expect(container.querySelector('[data-slot="code-block-code"]')).toHaveTextContent(
      'Binary files a/image.png and b/image.png differ',
    );
  });

  it('groups line deltas below the title and exposes the diff action as a secondary control', () => {
    render(
      createElement(ServerConfigProvider, {
        children: createElement(EditedFilesCard, { entries: [singleEntry] }),
        createStore: () => initServerConfigStore({}),
      }),
    );

    const title = screen.getByText('editedFiles.singleTitle:Acceptance/index.tsx');
    const action = screen.getByRole('button', { name: 'editedFiles.viewChanges' });
    const summary = title.parentElement;

    expect(summary).toHaveTextContent('+7');
    expect(summary).toHaveTextContent('-2');
    expect(summary).not.toContainElement(action);
    expect(action.closest('[data-view-changes]')).not.toBeNull();
    expect(action).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(action);
    expect(action).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'editedFiles.hideChanges' })).toBeInTheDocument();
  });
});
