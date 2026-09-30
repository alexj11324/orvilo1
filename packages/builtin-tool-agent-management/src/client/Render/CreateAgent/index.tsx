'use client';

import { Markdown } from '@lobehub/ui';
import { Avatar, Tag } from '@lobehub/ui/base-ui';
import { AGENT_CHAT_URL } from '@orvilo/const';
import type { BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { ArrowRight } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router';

import type { CreateAgentParams, CreateAgentState } from '../../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  agentCard: css`
    cursor: pointer;

    padding-block: 10px;
    padding-inline: 12px;
    border-radius: 8px;

    background: ${cssVar.colorFillQuaternary};

    transition: background 0.2s;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  agentDescription: css`
    overflow: hidden;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  agentTitle: css`
    font-size: 13px;
    font-weight: 500;
  `,
  arrowIcon: css`
    color: ${cssVar.colorTextTertiary};
  `,
  container: css`
    padding-block: 4px;
  `,
  field: css`
    margin-block-end: 8px;

    &:last-child {
      margin-block-end: 0;
    }
  `,
  label: css`
    margin-block-end: 4px;
    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};
  `,
  value: css`
    font-size: 13px;
  `,
}));

export const CreateAgentRender = memo<BuiltinRenderProps<CreateAgentParams, CreateAgentState>>(
  ({ args, pluginState }) => {
    const navigate = useNavigate();
    const { title, description, systemRole, plugins, model, provider, avatar, backgroundColor } =
      args || {};

    const handleNavigateToAgent = useCallback(() => {
      const targetId = pluginState?.agentId;
      if (!targetId) return;
      navigate(AGENT_CHAT_URL(targetId));
    }, [navigate, pluginState?.agentId]);

    // After tool execution succeeds, render a clickable agent card
    if (pluginState?.success && pluginState.agentId) {
      return (
        <div
          className={cx('flex flex-row items-center gap-3', styles.agentCard)}
          onClick={handleNavigateToAgent}
        >
          <Avatar
            avatar={avatar || '🤖'}
            background={backgroundColor}
            shape={'square'}
            size={36}
            title={title || undefined}
          />
          <div className="flex flex-col flex-1 gap-0.5">
            <span className={styles.agentTitle}>{title}</span>
            {description && <span className={styles.agentDescription}>{description}</span>}
          </div>
          <ArrowRight className={styles.arrowIcon} size={16} />
        </div>
      );
    }

    // While tool is still executing (no pluginState yet), show args preview
    if (!title && !description && !systemRole && !plugins?.length) return null;

    return (
      <div className={styles.container}>
        {title && (
          <div className={styles.field}>
            <div className={styles.label}>Title</div>
            <div className={styles.value}>{title}</div>
          </div>
        )}
        {description && (
          <div className={styles.field}>
            <div className={styles.label}>Description</div>
            <div className={styles.value}>{description}</div>
          </div>
        )}
        {(model || provider) && (
          <div className={styles.field}>
            <div className={styles.label}>Model</div>
            <div className={styles.value}>
              {provider && `${provider}/`}
              {model}
            </div>
          </div>
        )}
        {plugins && plugins.length > 0 && (
          <div className={styles.field}>
            <div className={styles.label}>Plugins</div>
            <div className="flex flex-row gap-1 flex-wrap">
              {plugins.map((plugin) => (
                <Tag key={plugin}>{plugin}</Tag>
              ))}
            </div>
          </div>
        )}
        {systemRole && (
          <div className={styles.field}>
            <div className={styles.label}>System Prompt</div>
            <div
              className="rounded-md border bg-card"
              style={{ paddingBlock: 8, paddingInline: 12, width: '100%' }}
            >
              <Markdown fontSize={13} variant={'chat'}>
                {systemRole}
              </Markdown>
            </div>
          </div>
        )}
      </div>
    );
  },
);

CreateAgentRender.displayName = 'CreateAgentRender';

export default CreateAgentRender;
