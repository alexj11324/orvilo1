'use client';

import { isRemoteHeterogeneousType } from '@orvilo/heterogeneous-agents';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import isEqual from 'fast-deep-equal';
import React, { memo } from 'react';

import AgentAccessSettings from '@/features/AgentSettings/AgentAccessSettings';
import AgentAdvancedSettings from '@/features/AgentSettings/AgentAdvancedSettings';
import AgentDeviceSettings from '@/features/AgentSettings/AgentDeviceSettings';
import AgentGeneralSettings from '@/features/AgentSettings/AgentGeneralSettings';
import AgentModelSettings from '@/features/AgentSettings/AgentModelSettings';
import { AgentUseSettings } from '@/features/AgentSettings/AgentUseSettings';
import ExternalAgentConnectionSettings from '@/features/AgentSettings/ExternalAgentConnectionSettings';
import { isBuiltinEngineType } from '@/features/HeterogeneousAgent/engine';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

import EditorCanvas from '../EditorCanvas';
import AgentHeader from './AgentHeader';

const styles = createStaticStyles(({ css }) => ({
  configStack: css`
    container-type: inline-size;
  `,
  topArea: css`
    cursor: default;
    margin-block-end: 28px;
  `,
}));

const ProfileEditor = memo(() => {
  const agentId = useAgentStore((s) => s.activeAgentId || '');
  const config = useAgentStore(agentSelectors.getAgentConfigById(agentId), isEqual);
  const isHeterogeneous = useAgentStore(agentSelectors.isCurrentAgentHeterogeneous);
  const heterogeneousProvider = config?.agencyConfig?.heterogeneousProvider;

  const isRemoteHetero =
    isHeterogeneous &&
    !!heterogeneousProvider &&
    isRemoteHeterogeneousType(heterogeneousProvider.type);
  const isBuiltinEngine =
    isHeterogeneous && !!heterogeneousProvider && isBuiltinEngineType(heterogeneousProvider.type);
  // External harnesses (local CLIs + remote platforms) get the Connection
  // group; builtin/legacy runtimes get the General tools group. Both share
  // the same Device and Access groups — the execution contract's single
  // device component and one write path per setting.
  const externalAgent = isHeterogeneous && !!heterogeneousProvider && !isBuiltinEngine;

  return (
    <>
      <div
        className={cn('flex flex-col', styles.topArea)}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {/* Header: Avatar + Name + Description */}
        <AgentHeader />
        <div
          className={cn('flex flex-col gap-2', styles.configStack)}
          style={{ paddingBlock: isRemoteHetero ? '8px 0' : undefined }}
        >
          {externalAgent ? (
            <>
              <ExternalAgentConnectionSettings agentId={agentId} />
              {/* Remote platforms carry no local model rows — model/effort is
                  a local-CLI concept. */}
              {isRemoteHetero ? null : <AgentModelSettings agentId={agentId} />}
              <AgentDeviceSettings agentId={agentId} />
              <AgentAccessSettings agentId={agentId} />
              <AgentUseSettings agentId={agentId} />
              <AgentAdvancedSettings agentId={agentId} />
            </>
          ) : (
            <>
              <AgentGeneralSettings agentId={agentId} />
              <AgentModelSettings agentId={agentId} />
              <AgentDeviceSettings agentId={agentId} />
              <AgentAccessSettings agentId={agentId} />
              <AgentUseSettings agentId={agentId} />
              <AgentAdvancedSettings agentId={agentId} />
            </>
          )}
        </div>
      </div>
      {/* Main Content: Prompt Editor — built-in model runtime only. Hetero agents
          (Claude Code / Codex + remote platforms) run an external CLI with its own
          system prompt, so the agent's systemRole never reaches them. Hide the
          editor here to avoid a control that looks effective but isn't. */}
      {!isHeterogeneous && <EditorCanvas />}
    </>
  );
});

export default ProfileEditor;
