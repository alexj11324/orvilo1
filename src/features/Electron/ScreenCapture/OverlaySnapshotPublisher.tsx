'use client';

import type {
  ScreenCaptureAgentOption,
  ScreenCaptureOverlayTheme,
} from '@orvilo/electron-client-ipc';
import { useTheme } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { memo, useEffect, useMemo, useRef } from 'react';

import { useFetchAgentList } from '@/hooks/useFetchAgentList';
import { useAgentStore } from '@/store/agent';
import { agentSelectors, builtinAgentSelectors } from '@/store/agent/selectors';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/slices/agentList/selectors';
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
  const theme = useTheme();
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

  const overlayTheme = useMemo<ScreenCaptureOverlayTheme>(
    () => ({
      colorBgElevated: theme.colorBgElevated,
      colorBorderSecondary: theme.colorBorderSecondary,
      colorFill: theme.colorFill,
      colorFillQuaternary: theme.colorFillQuaternary,
      colorFillSecondary: theme.colorFillSecondary,
      colorFillTertiary: theme.colorFillTertiary,
      colorPrimary: theme.colorPrimary,
      colorPrimaryActive: theme.colorPrimaryActive,
      colorPrimaryHover: theme.colorPrimaryHover,
      colorText: theme.colorText,
      colorTextLightSolid: theme.colorTextLightSolid,
      colorTextQuaternary: theme.colorTextQuaternary,
      colorTextSecondary: theme.colorTextSecondary,
      colorTextTertiary: theme.colorTextTertiary,
      panelBorder: theme.isDarkMode ? theme.colorFillSecondary : theme.colorFill,
      panelShadow: theme.isDarkMode ? PANEL_SHADOW_DARK : PANEL_SHADOW_LIGHT,
    }),
    [
      theme.colorBgElevated,
      theme.colorBorderSecondary,
      theme.colorFill,
      theme.colorFillQuaternary,
      theme.colorFillSecondary,
      theme.colorFillTertiary,
      theme.colorPrimary,
      theme.colorPrimaryActive,
      theme.colorPrimaryHover,
      theme.colorText,
      theme.colorTextLightSolid,
      theme.colorTextQuaternary,
      theme.colorTextSecondary,
      theme.colorTextTertiary,
      theme.isDarkMode,
    ],
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
