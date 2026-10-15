import { DRAG_DROP_PASTE } from '@orvilo/editor-runtime/native-browser';
import {
  DEFAULT_HEADLESS_EDITOR_PLUGINS,
  FilePlugin,
  INSERT_FILE_COMMAND,
  NativeBrowserKernel,
  type NativeIPlugin,
  UploadPlugin,
} from '@orvilo/editor-runtime/native-browser';
import { DROP_COMMAND } from 'lexical';
import { describe, expect, it, vi } from 'vitest';

// Real local kernel, FilePlugin, upload service and standard Lexical commands.
// Only the external business upload callback is controlled by this test.
function setup() {
  const upload = vi.fn(async (_file: File) => ({ url: '/f/native-file-test' }));
  const kernel = new NativeBrowserKernel();
  kernel.registerPlugins([
    UploadPlugin,
    ...DEFAULT_HEADLESS_EDITOR_PLUGINS.map((entry): NativeIPlugin => {
      const plugin = Array.isArray(entry) ? entry[0] : entry;
      return plugin === FilePlugin ? [FilePlugin, { handleUpload: upload }] : entry;
    }),
  ]);
  kernel.initNodeEditor();
  kernel.setDocument('markdown', 'Original');
  const lexical = kernel.getLexicalEditor();
  if (!lexical) throw new Error('Real native kernel did not initialize');
  return { kernel, lexical, upload };
}

describe('native file upload editability', () => {
  it('blocks paste and drop while locked, including after a live editability change', async () => {
    const { kernel, lexical, upload } = setup();
    try {
      kernel.setEditable(false);
      const before = JSON.stringify(kernel.getDocument('json'));
      const file = new File(['actual contents'], 'locked.txt', { type: 'text/plain' });
      const preventDefault = vi.fn();
      const stopImmediatePropagation = vi.fn();
      lexical.dispatchCommand(INSERT_FILE_COMMAND, { file });
      lexical.dispatchCommand(DRAG_DROP_PASTE, [file]);
      lexical.dispatchCommand(DROP_COMMAND, {
        dataTransfer: { files: [file] },
        preventDefault,
        stopImmediatePropagation,
      } as unknown as DragEvent);
      await Promise.resolve();
      expect(upload).not.toHaveBeenCalled();
      expect(preventDefault).not.toHaveBeenCalled();
      expect(stopImmediatePropagation).not.toHaveBeenCalled();
      expect(JSON.stringify(kernel.getDocument('json'))).toBe(before);
      kernel.setEditable(true);
      lexical.dispatchCommand(DRAG_DROP_PASTE, [file]);
      await vi.waitFor(() => expect(upload).toHaveBeenCalledWith(file));
      await vi.waitFor(() =>
        expect(JSON.stringify(kernel.getDocument('json'))).toContain('/f/native-file-test'),
      );
      kernel.setEditable(false);
      const completed = JSON.stringify(kernel.getDocument('json'));
      lexical.dispatchCommand(DRAG_DROP_PASTE, [new File(['blocked'], 'second.txt')]);
      await Promise.resolve();
      expect(upload).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(kernel.getDocument('json'))).toBe(completed);
    } finally {
      kernel.destroy();
    }
  });
});
