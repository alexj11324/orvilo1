import type { HostAttachmentPickOptions } from './host';

/**
 * User-authorized attachment pick via a transient DOM file input. Works on
 * every host that renders DOM (web and desktop alike): the user explicitly
 * grants File objects — this never confers filesystem scope, directory
 * handles, or device identity. Resolves with the picked files, or `[]` when
 * the user cancels.
 */
export const pickFilesViaDomInput = (options?: HostAttachmentPickOptions): Promise<File[]> =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options?.accept) input.accept = options.accept;
    input.multiple = options?.multiple ?? true;
    input.style.display = 'none';

    const finish = (files: File[]) => {
      input.remove();
      resolve(files);
    };

    input.addEventListener('change', () => finish([...(input.files ?? [])]));
    // `cancel` fires on dismiss in supporting browsers; blur+cleanup fallback
    // keeps the promise settled where it doesn't.
    input.addEventListener('cancel', () => finish([]));

    document.body.append(input);
    input.click();
  });
