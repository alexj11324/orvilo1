/** Resolves `true` when the text reached the clipboard, `false` when both paths failed. */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.append(textArea);
    textArea.focus();
    textArea.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      textArea.remove();
    }
  }
};
