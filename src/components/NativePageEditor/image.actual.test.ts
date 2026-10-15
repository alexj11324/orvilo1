import { DRAG_DROP_PASTE } from '@orvilo/editor-runtime/native-browser';
import {
  DEFAULT_HEADLESS_EDITOR_PLUGINS,
  ImagePlugin,
  INSERT_IMAGE_COMMAND,
  NativeBrowserKernel,
  type NativeIPlugin,
  UploadPlugin,
} from '@orvilo/editor-runtime/native-browser';
import { describe, expect, it, vi } from 'vitest';

// The real upload service awaits dimensions before dispatching its actual image
// command. Lock during that await must prevent insertion and business upload.
describe('native image upload editability', () => {
  it('rechecks actual editor editability after asynchronous image dimension decode', async () => {
    let resolveWidth: (width: number) => void = () => {
      throw new Error('Decode has not started');
    };
    const decodeStarted = vi.fn();
    const upload = vi.fn(async (_file: File) => ({ url: '/f/native-image-test' }));
    const kernel = new NativeBrowserKernel();
    kernel.registerPlugins([
      UploadPlugin,
      ...DEFAULT_HEADLESS_EDITOR_PLUGINS.map((entry): NativeIPlugin => {
        const plugin = Array.isArray(entry) ? entry[0] : entry;
        return plugin === ImagePlugin
          ? [
              ImagePlugin,
              {
                handleUpload: upload,
                getImageWidth: () => {
                  decodeStarted();
                  return new Promise<number>((resolve) => {
                    resolveWidth = resolve;
                  });
                },
              },
            ]
          : entry;
      }),
    ]);
    kernel.initNodeEditor();
    kernel.setDocument('markdown', 'Original');
    const editor = kernel.getLexicalEditor();
    if (!editor) throw new Error('Actual native editor is unavailable');
    try {
      const before = JSON.stringify(kernel.getDocument('json'));
      editor.dispatchCommand(DRAG_DROP_PASTE, [
        new File(['image'], 'example.png', { type: 'image/png' }),
      ]);
      expect(decodeStarted).toHaveBeenCalledTimes(1);
      kernel.setEditable(false);
      editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
        file: new File(['blocked'], 'locked.png', { type: 'image/png' }),
      });
      resolveWidth(128);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(upload).not.toHaveBeenCalled();
      expect(JSON.stringify(kernel.getDocument('json'))).toBe(before);
    } finally {
      kernel.destroy();
    }
  });
});
