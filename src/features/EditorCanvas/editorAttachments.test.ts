import type { IEditor } from '@lobehub/editor';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFileIdForUrl } from './attachmentRegistry';
import {
  getEditorAttachmentStateFromJson,
  getExistingEditorAttachment,
  insertExistingAttachmentsIntoEditor,
  pickAndInsertAttachments,
  preservePendingFileNodeSize,
} from './editorAttachments';

describe('getEditorAttachmentStateFromJson', () => {
  it('distinguishes completed attachments from pending and failed uploads', () => {
    expect(
      getEditorAttachmentStateFromJson({
        root: {
          children: [
            {
              fileUrl: 'https://files.example.com/report.pdf',
              status: 'uploaded',
              type: 'file',
            },
            { src: 'blob:pending-image', status: 'loading', type: 'block-image' },
            { message: 'upload failed', status: 'error', type: 'image' },
          ],
        },
      }),
    ).toEqual({ hasCompletedAttachments: true, hasIncompleteAttachments: true });
  });

  it('treats an uploaded image as a completed attachment', () => {
    expect(
      getEditorAttachmentStateFromJson({
        root: {
          children: [
            { src: 'https://files.example.com/image.png', status: 'uploaded', type: 'image' },
          ],
        },
      }),
    ).toEqual({ hasCompletedAttachments: true, hasIncompleteAttachments: false });
  });
});

describe('insertExistingAttachmentsIntoEditor', () => {
  it('marks library resources for reuse instead of uploading them again', () => {
    const dispatchCommand = vi.fn();
    const focus = vi.fn();
    const editor = {
      focus,
      getLexicalEditor: () => ({ dispatchCommand }),
    } as unknown as IEditor;
    const attachment = {
      fileId: 'file-library-1',
      fileType: 'application/pdf',
      name: 'roadmap.pdf',
      size: 2048,
      url: 'https://files.example.com/roadmap.pdf',
    };

    insertExistingAttachmentsIntoEditor(editor, [attachment]);

    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    const placeholderFile = dispatchCommand.mock.calls[0][1].file as File;
    expect(placeholderFile).toBeInstanceOf(File);
    expect(placeholderFile.name).toBe(attachment.name);
    expect(placeholderFile.size).toBe(attachment.size);
    expect(getExistingEditorAttachment(placeholderFile)).toEqual(attachment);
    expect(getFileIdForUrl(attachment.url)).toBe(attachment.fileId);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('persists the source size on the pending file node', () => {
    const writable = { __size: undefined as number | undefined };
    const fileNode = {
      getType: () => 'file',
      getWritable: () => writable,
      name: 'roadmap.pdf',
      size: undefined,
      status: 'pending',
    };
    const root = {
      getChildren: () => [fileNode],
      getType: () => 'root',
    };
    const file = new File(['content'], 'roadmap.pdf', { type: 'application/pdf' });

    expect(preservePendingFileNodeSize(root as never, file)).toBe(true);
    expect(writable.__size).toBe(file.size);
  });
});

describe('pickAndInsertAttachments', () => {
  interface FakeInput {
    accept: string;
    addEventListener: ReturnType<typeof vi.fn>;
    click: ReturnType<typeof vi.fn>;
    files: File[];
    multiple: boolean;
    triggerChange: () => void;
    type: string;
  }

  const fakeInput = (): FakeInput => {
    const handlers: Array<() => void> = [];
    const input: FakeInput = {
      accept: '',
      addEventListener: vi.fn((_type: string, cb: () => void) => {
        handlers.push(cb);
      }),
      click: vi.fn(),
      files: [new File(['data'], 'note.txt', { type: 'text/plain' })],
      multiple: false,
      triggerChange: () => handlers.forEach((handler) => handler()),
      type: '',
    };
    vi.spyOn(document, 'createElement').mockReturnValue(input as unknown as HTMLElement);
    return input;
  };

  const editor = () => {
    const dispatchCommand = vi.fn();
    return {
      dispatchCommand,
      focus: vi.fn(),
      getLexicalEditor: () => ({ dispatchCommand }),
    } as unknown as IEditor & { dispatchCommand: ReturnType<typeof vi.fn> };
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('inserts the picked files once the dialog resolves', () => {
    const input = fakeInput();
    const target = editor();

    pickAndInsertAttachments(target);
    input.triggerChange();

    expect(input.click).toHaveBeenCalledTimes(1);
    expect(target.dispatchCommand).toHaveBeenCalledTimes(1);
    expect(target.dispatchCommand.mock.calls[0][1].file).toBeInstanceOf(File);
  });

  it('never opens the picker when the guard already rejects', () => {
    const input = fakeInput();
    const onBlocked = vi.fn();

    pickAndInsertAttachments(editor(), undefined, { canInsert: () => false, onBlocked });

    expect(input.click).not.toHaveBeenCalled();
    expect(input.addEventListener).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });

  it('re-checks the guard when the dialog resolves and drops the files', () => {
    const input = fakeInput();
    const target = editor();
    const onBlocked = vi.fn();
    let allowed = true;

    pickAndInsertAttachments(target, undefined, { canInsert: () => allowed, onBlocked });
    allowed = false;
    input.triggerChange();

    expect(target.dispatchCommand).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });

  it('forwards the accept filter to the file input', () => {
    const input = fakeInput();

    pickAndInsertAttachments(editor(), 'image/*');

    expect(input.accept).toBe('image/*');
    expect(input.click).toHaveBeenCalledTimes(1);
  });
});
