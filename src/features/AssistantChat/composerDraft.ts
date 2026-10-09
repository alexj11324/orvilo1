/** Plain markdown drafts can coexist with the previous Lexical draft format. */
export const encodeComposerDraft = (text: string): Record<string, unknown> => ({
  assistantUiMarkdown: text,
});

export const decodeComposerDraft = (json: Record<string, unknown> | undefined): string => {
  if (!json) return '';
  if (typeof json.assistantUiMarkdown === 'string') return json.assistantUiMarkdown;
  const read = (node: unknown): string => {
    if (!node || typeof node !== 'object') return '';
    const value = node as { children?: unknown[]; text?: string; type?: string };
    if (typeof value.text === 'string') return value.text;
    if (value.type === 'linebreak') return '\n';
    return (value.children ?? []).map(read).join(value.type === 'root' ? '\n' : '');
  };
  return read(json.root ?? json);
};

/** Never replay a failed send over text typed since it was cleared. */
export const canRestoreComposerDraft = (
  sentKey: string,
  currentKey: string,
  clearedRevision: number,
  currentRevision: number,
  currentText: string,
): boolean => sentKey === currentKey && clearedRevision === currentRevision && !currentText;

/** Text edits do not relinquish the original conversation's unsent attachments. */
export function recoverComposerDraft({
  mounted,
  sentKey,
  currentKey,
  clearedRevision,
  currentRevision,
  currentText,
  restoreText,
  restoreAttachments,
  preserveDraft,
}: {
  mounted: boolean;
  sentKey: string;
  currentKey: string;
  clearedRevision: number;
  currentRevision: number;
  currentText: string;
  restoreText: () => void;
  restoreAttachments: () => void;
  preserveDraft: () => void;
}): void {
  if (!mounted || sentKey !== currentKey) {
    preserveDraft();
    return;
  }
  if (canRestoreComposerDraft(sentKey, currentKey, clearedRevision, currentRevision, currentText)) {
    restoreText();
  }
  restoreAttachments();
}

/** Preflight failures recover drafts; failures after persistence never replay a turn. */
export async function submitComposerTurn(
  send: (callbacks: {
    onMessageAccepted: () => void;
    onPreflightFailure: () => void;
  }) => Promise<void>,
  restore: () => void,
): Promise<void> {
  let accepted = false;
  let restored = false;
  const recover = () => {
    if (accepted || restored) return;
    restored = true;
    restore();
  };
  try {
    await send({
      onMessageAccepted: () => {
        accepted = true;
      },
      onPreflightFailure: recover,
    });
  } catch {
    recover();
  }
}

/** Gate every entry point, including keyboard sends and pasted uploads, while access resolves. */
export async function runComposerAction<T>(
  access: { canUseResource: boolean; isAccessLoading: boolean },
  action: () => T | Promise<T>,
): Promise<T | undefined> {
  if (!access.canUseResource || access.isAccessLoading) return;
  return action();
}
