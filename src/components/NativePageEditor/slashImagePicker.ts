/** A real native file picker with symmetric listeners and explicit owner cleanup.
 * Disposing for unmount/readonly never invokes a user callback or consumes text. */
export function createNativeSlashImagePicker({
  doc,
  onFile,
  onCancel,
  onError,
}: {
  doc: Document;
  onFile: (file: File) => void;
  onCancel: () => void;
  onError: () => void;
}): { dispose: () => void; open: () => void } {
  const input = doc.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.hidden = true;
  let settled = false;
  function dispose() {
    settled = true;
    input.removeEventListener('change', change);
    input.removeEventListener('cancel', cancel);
    input.remove();
  }
  function change() {
    if (settled) return;
    const file = input.files?.[0];
    dispose();
    if (file) onFile(file);
    else onCancel();
  }
  function cancel() {
    if (settled) return;
    dispose();
    onCancel();
  }
  input.addEventListener('change', change);
  input.addEventListener('cancel', cancel);
  return {
    dispose,
    open: () => {
      if (settled) return;
      doc.body.append(input);
      try {
        input.click();
      } catch {
        dispose();
        onError();
      }
    },
  };
}
