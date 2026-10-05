import { beforeEach, describe, expect, it, vi } from 'vitest';

import { finishOnboardingAndNavigate, repairDesktopOnboardingMarkers } from './finishOnboarding';

const targetMock = vi.hoisted(() => vi.fn(() => '/workspace'));
const selectMock = vi.hoisted(() => vi.fn());
const desktopMarkers = vi.hoisted(() => ({
  completed: vi.fn(),
  everCompleted: vi.fn(),
  persist: vi.fn(),
}));
vi.mock('@/services/electron/system', () => ({
  electronSystemService: { setDesktopOnboardingCompleted: desktopMarkers.persist },
}));
vi.mock('@/features/DesktopOnboarding/storage', () => ({
  setDesktopOnboardingCompleted: desktopMarkers.completed,
  setDesktopOnboardingEverCompleted: desktopMarkers.everCompleted,
}));
vi.mock('@/features/Conversation/selectAgent', () => ({ selectAgentForConversation: selectMock }));

vi.mock('@/utils/onboardingRedirect', () => ({
  resolvePostOnboardingTargetUrl: targetMock,
}));

describe('finishOnboardingAndNavigate', () => {
  beforeEach(() => {
    targetMock.mockClear();
    selectMock.mockClear();
    vi.clearAllMocks();
  });

  it('keeps desktop marker repair inert in the web runtime', async () => {
    await repairDesktopOnboardingMarkers();
    expect(desktopMarkers.completed).not.toHaveBeenCalled();
    expect(desktopMarkers.everCompleted).not.toHaveBeenCalled();
    expect(desktopMarkers.persist).not.toHaveBeenCalled();
  });

  it('does not persist finishedAt or navigate when first-agent transfer fails', async () => {
    const finish = vi.fn();
    const navigate = vi.fn();
    await expect(
      finishOnboardingAndNavigate(finish, navigate, async () => {
        throw new Error('transfer failed');
      }),
    ).rejects.toThrow('transfer failed');
    expect(finish).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('transfers first, then persists completion and navigates', async () => {
    const events: string[] = [];
    await finishOnboardingAndNavigate(
      async () => {
        events.push('finishedAt');
      },
      () => {
        events.push('navigate');
      },
      async () => {
        events.push('transfer');
      },
    );
    expect(events).toEqual(['transfer', 'finishedAt', 'navigate']);
  });

  it('waits for onboarding persistence before navigating to the target', async () => {
    const events: string[] = [];
    const finishOnboarding = vi.fn(async () => {
      events.push('finish');
    });
    const navigate = vi.fn((target: string) => {
      events.push(`navigate:${target}`);
    });

    await finishOnboardingAndNavigate(finishOnboarding, navigate);

    expect(events).toEqual(['finish', 'navigate:/workspace']);
    expect(targetMock).toHaveBeenCalledTimes(1);
  });
  it('selects the verified first Agent as the blank composer default after completing', async () => {
    const navigate = vi.fn();
    const finish = vi.fn();
    await finishOnboardingAndNavigate(finish, navigate, undefined, 'configured-first-agent');
    expect(selectMock).toHaveBeenCalledWith('configured-first-agent');
    expect(finish.mock.invocationCallOrder[0]).toBeLessThan(selectMock.mock.invocationCallOrder[0]);
    expect(selectMock.mock.invocationCallOrder[0]).toBeLessThan(
      navigate.mock.invocationCallOrder[0],
    );
  });
});
