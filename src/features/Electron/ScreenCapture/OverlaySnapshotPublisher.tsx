'use client';

import type {
  ScreenCaptureAgentOption,
  ScreenCaptureOverlayTheme,
} from '@orvilo/electron-client-ipc';
import isEqual from 'fast-deep-equal';
import { memo, useEffect, useMemo, useRef } from 'react';

import { useFetchAgentList } from '@/hooks/useFetchAgentList';
import { useAgentStore } from '@/store/agent';
import { agentSelectors, builtinAgentSelectors } from '@/store/agent/selectors';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/slices/agentList/selectors';
import { useGeneratedTheme } from '@/styles/themeRoles';
import { ensureElectronIpc } from '@/utils/electron/ipc';

import { resolveOverlayAgentOptions, resolveOverlayDefaultAgentId } from './overlaySnapshot';

const PANEL_SHADOW_DARK = '0 4px 4px color-mix(in srgb, #000 40%, transparent)';
const PANEL_SHADOW_LIGHT = '0 4px 4px color-mix(in srgb, #000 4%, transparent)';

/**
 * Mirrors the main renderer's current agent list into the electron main
 * process so the screen-capture overlay selector can render it. Data flow is
 * one-directional: renderer → main (cache) → overlay on open. The overlay no
 * longer picks a model — the submitted agent's stored config supplies it.
 */
const OverlaySnapshotPublisher = memo(() => {
  useFetchAgentList();

  const allAgents = useHomeStore(homeAgentListSelectors.allAgents, isEqual);
  const { mode, roles } = useGeneratedTheme();
  const activeAgentId = useAgentStore((s) => s.activeAgentId);
  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);
  const inboxMeta = useAgentStore((s) =>
    inboxAgentId ? agentSelectors.getAgentMetaById(inboxAgentId)(s) : {},
  );
  const agents = useMemo(() => allAgents.filter((item) => item.type === 'agent'), [allAgents]);

  const agentOptions = useMemo<ScreenCaptureAgentOption[]>(
    () =>
      resolveOverlayAgentOptions({
        agents,
        inboxAgentId,
        inboxMeta,
      }),
    [agents, inboxAgentId, inboxMeta],
  );

  const defaultAgentId = useMemo(
    () =>
      resolveOverlayDefaultAgentId({
        activeAgentId,
        agentOptions,
        inboxAgentId,
      }),
    [activeAgentId, agentOptions, inboxAgentId],
  );

  // The overlay window has no theme host of its own; send it resolved roles.
  const overlayTheme = useMemo<ScreenCaptureOverlayTheme>(
    () => ({
      colorBgElevated: roles.popover,
      colorBorderSecondary: roles.divider,
      colorFill: roles.fill,
      colorFillQuaternary: roles['fill-quaternary'],
      colorFillSecondary: roles.selected,
      colorFillTertiary: roles.muted,
      colorPrimary: roles.primary,
      colorPrimaryActive: roles['primary-active'],
      colorPrimaryHover: roles['primary-hover'],
      colorText: roles.foreground,
      colorTextLightSolid: roles['primary-foreground'],
      colorTextQuaternary: roles['foreground-quaternary'],
      colorTextSecondary: roles['muted-foreground'],
      colorTextTertiary: roles['foreground-tertiary'],
      panelBorder: mode === 'dark' ? roles.selected : roles.fill,
      panelShadow: mode === 'dark' ? PANEL_SHADOW_DARK : PANEL_SHADOW_LIGHT,
    }),
    [mode, roles],
  );

  const lastPublishedRef = useRef<string>('');

  useEffect(() => {
    const payload = {
      agents: agentOptions,
      defaultAgentId,
      theme: overlayTheme,
    };
    const signature = JSON.stringify(payload);
    if (signature === lastPublishedRef.current) return;
    lastPublishedRef.current = signature;

    try {
      ensureElectronIpc().screenCapture.publishOverlaySnapshot(payload);
    } catch (error) {
      // Preload bridge not mounted (e.g. web build) — publisher is a no-op.
      console.warn('[OverlaySnapshotPublisher] publish failed:', error);
    }
  }, [agentOptions, defaultAgentId, overlayTheme]);

  return null;
});

OverlaySnapshotPublisher.displayName = 'OverlaySnapshotPublisher';

export default OverlaySnapshotPublisher;
