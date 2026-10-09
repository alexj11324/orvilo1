import { describe, expect, it, vi } from 'vitest';

import {
  canRestoreComposerDraft,
  decodeComposerDraft,
  encodeComposerDraft,
  recoverComposerDraft,
  runComposerAction,
  submitComposerTurn,
} from './composerDraft';

describe('assistant-ui composer draft bridge', () => {
  it('round-trips markdown including whitespace and formatting', () => {
    const text = '**Draft**\n\n- item\n  ';
    expect(decodeComposerDraft(encodeComposerDraft(text))).toBe(text);
  });

  it('recovers existing Lexical drafts on UI migration', () => {
    expect(
      decodeComposerDraft({
        root: {
          type: 'root',
          children: [
            { type: 'paragraph', children: [{ text: 'Existing ' }, { text: 'draft' }] },
            { type: 'paragraph', children: [{ text: 'Second line' }] },
          ],
        },
      }),
    ).toBe('Existing draft\nSecond line');
  });

  it('restores a failed preflight only in the unchanged original composer', () => {
    expect(canRestoreComposerDraft('topic_a', 'topic_a', 2, 2, '')).toBe(true);
    expect(canRestoreComposerDraft('topic_a', 'topic_b', 2, 2, '')).toBe(false);
    expect(canRestoreComposerDraft('topic_a', 'topic_a', 2, 3, 'New text')).toBe(false);
    // Typing and deleting is still a new draft, even if the textarea is empty.
    expect(canRestoreComposerDraft('topic_a', 'topic_a', 2, 4, '')).toBe(false);
  });
});

describe('composer send acceptance', () => {
  it('recovers one draft when preflight both calls back and throws', async () => {
    const restore = vi.fn();
    await submitComposerTurn(async ({ onPreflightFailure }) => {
      onPreflightFailure();
      throw new Error('Permission denied');
    }, restore);
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('never restores an accepted message or its attachments after a stream error', async () => {
    const restore = vi.fn();
    await submitComposerTurn(async ({ onMessageAccepted }) => {
      onMessageAccepted();
      throw new Error('Stream disconnected');
    }, restore);
    expect(restore).not.toHaveBeenCalled();
  });

  it('restores a rejected send even when no failure callback fired', async () => {
    const restore = vi.fn();
    await submitComposerTurn(async () => {
      throw new Error('Admission failed');
    }, restore);
    expect(restore).toHaveBeenCalledTimes(1);
  });
});

describe('failed composer send recovery', () => {
  const recovery = (overrides: Partial<Parameters<typeof recoverComposerDraft>[0]> = {}) => ({
    mounted: true,
    sentKey: 'topic_a',
    currentKey: 'topic_a',
    clearedRevision: 2,
    currentRevision: 2,
    currentText: '',
    restoreText: vi.fn(),
    restoreAttachments: vi.fn(),
    preserveDraft: vi.fn(),
    ...overrides,
  });

  it('recovers attachments after preflight fails without replacing a newer draft', async () => {
    const actions = recovery({
      currentRevision: 3,
      currentText: 'New draft typed during preflight',
    });
    await submitComposerTurn(
      async ({ onPreflightFailure }) => {
        onPreflightFailure();
        throw new Error('Admission denied');
      },
      () => recoverComposerDraft(actions),
    );
    expect(actions.restoreText).not.toHaveBeenCalled();
    expect(actions.restoreAttachments).toHaveBeenCalledTimes(1);
    expect(actions.preserveDraft).not.toHaveBeenCalled();
  });

  it('recovers files and selections even when newer text was typed then deleted', () => {
    const actions = recovery({ currentRevision: 4 });
    recoverComposerDraft(actions);
    expect(actions.restoreText).not.toHaveBeenCalled();
    expect(actions.restoreAttachments).toHaveBeenCalledTimes(1);
  });

  it.each([{ currentKey: 'topic_b' }, { mounted: false }])(
    'does not leak attachments after leaving the original conversation: %j',
    (state) => {
      const actions = recovery(state);
      recoverComposerDraft(actions);
      expect(actions.restoreText).not.toHaveBeenCalled();
      expect(actions.restoreAttachments).not.toHaveBeenCalled();
      expect(actions.preserveDraft).toHaveBeenCalledTimes(1);
    },
  );

  it('recovers both text and attachments in an unchanged composer', () => {
    const actions = recovery();
    recoverComposerDraft(actions);
    expect(actions.restoreText).toHaveBeenCalledTimes(1);
    expect(actions.restoreAttachments).toHaveBeenCalledTimes(1);
    expect(actions.preserveDraft).not.toHaveBeenCalled();
  });
});

describe('composer resource access entry points', () => {
  it.each([
    { canUseResource: false, isAccessLoading: false },
    { canUseResource: true, isAccessLoading: true },
    { canUseResource: false, isAccessLoading: true },
  ])('denies send and upload callbacks for unresolved or view-only access: %j', async (access) => {
    const sendMessage = vi.fn();
    const uploadFiles = vi.fn();
    await runComposerAction(access, sendMessage);
    await runComposerAction(access, uploadFiles);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(uploadFiles).not.toHaveBeenCalled();
  });

  it('dispatches the action once once access has resolved with use permission', async () => {
    const sendMessage = vi.fn().mockResolvedValue('accepted');
    const result = await runComposerAction(
      { canUseResource: true, isAccessLoading: false },
      sendMessage,
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(result).toBe('accepted');
  });
});
