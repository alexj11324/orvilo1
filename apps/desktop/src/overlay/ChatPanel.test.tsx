import { describe, expect, it, vi } from 'vitest';

import { canSubmitOverlayPrompt, type ChatPanelSubmitPayload } from './ChatPanel';
import { resolvePanelPlacement } from './panelPlacement';

vi.mock('./chatPanel.css.ts', () => new Proxy({}, { get: (_, key) => String(key) }));

vi.mock('./cn', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}));

vi.mock('./Avatar', () => ({
  default: () => null,
}));

describe('ChatPanel', () => {
  it('keeps the last selection placement while a reselection is in progress', () => {
    expect(
      resolvePanelPlacement({
        dockedPlacement: null,
        initialPlacement: { left: 480, top: 720, width: 420 },
        lastSelectionPlacement: { left: 812, top: 168, width: 360 },
      }),
    ).toEqual({
      left: 812,
      top: 168,
      width: 360,
    });
  });

  it('falls back to the initial placement after the remembered position is cleared', () => {
    expect(
      resolvePanelPlacement({
        dockedPlacement: null,
        initialPlacement: { left: 480, top: 720, width: 420 },
        lastSelectionPlacement: null,
      }),
    ).toEqual({
      left: 480,
      top: 720,
      width: 420,
    });
  });

  it('allows sending a prompt without any screenshot', () => {
    expect(canSubmitOverlayPrompt({ prompt: 'hello', selections: [] })).toBe(true);
    expect(canSubmitOverlayPrompt({ prompt: '   ', selections: [] })).toBe(false);
  });

  it('waits for attached screenshots to finish uploading before sending', () => {
    expect(
      canSubmitOverlayPrompt({
        prompt: 'hello',
        selections: [{ uploadStatus: 'ready' }, { uploadStatus: 'uploading' }],
      }),
    ).toBe(false);
    expect(
      canSubmitOverlayPrompt({ prompt: 'hello', selections: [{ uploadStatus: 'ready' }] }),
    ).toBe(true);
  });

  it('submits with the agent as the sole invocation identity (no model pick)', () => {
    // The overlay's model selector is gone — the payload carries only the
    // agent id; model/provider resolve from that agent's stored config.
    const payload: ChatPanelSubmitPayload = {
      agentId: 'agent-1',
      captureIds: ['c1'],
      prompt: 'hi',
    };

    expect(Object.keys(payload).sort()).toEqual(['agentId', 'captureIds', 'prompt']);
  });
});
