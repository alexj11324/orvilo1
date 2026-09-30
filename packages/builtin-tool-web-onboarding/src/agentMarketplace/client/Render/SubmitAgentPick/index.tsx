'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { InstallMarketplaceAgentSummary } from '../../../pickResult';
import type { SubmitAgentPickArgs } from '../../../types';

interface SubmitAgentPickState {
  installedAgentIds?: string[];
  selectedAgentIds?: string[];
  skippedAgentIds?: string[];
  summaries?: InstallMarketplaceAgentSummary[];
}

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    display: flex;
    gap: 12px;
    align-items: center;

    padding: 12px;
    border: 1px solid ${cssVar.colorFillSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgElevated};
  `,
  cardSkipped: css`
    opacity: 0.65;
  `,
  description: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;

    font-size: 12px;
    line-height: 1.5;
    color: ${cssVar.colorTextSecondary};
  `,
  list: css`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 8px;
    width: 100%;
  `,
  meta: css`
    flex-shrink: 0;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  skippedTag: css`
    flex-shrink: 0;

    margin-inline-start: 4px;
    padding-block: 1px;
    padding-inline: 6px;
    border-radius: 999px;

    font-size: 11px;
    color: ${cssVar.colorTextTertiary};

    background: ${cssVar.colorFillTertiary};
  `,
  title: css`
    overflow: hidden;
    flex: 1;

    min-width: 0;

    font-size: 14px;
    font-weight: 600;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  titleRow: css`
    display: flex;
    gap: 6px;
    align-items: center;
    width: 100%;
  `,
}));

export type SubmitAgentPickRenderProps = Pick<
  BuiltinRenderProps<SubmitAgentPickArgs, SubmitAgentPickState>,
  'pluginState'
>;

const AgentAvatar = ({ avatar }: { avatar: string }) => {
  const tileStyle = {
    alignItems: 'center',
    background: cssVar.colorFillSecondary,
    borderRadius: 8,
    display: 'flex',
    flexShrink: 0,
    fontSize: 20,
    height: 36,
    justifyContent: 'center',
    lineHeight: 1,
    overflow: 'hidden',
    width: 36,
  } as const;
  if (/^https?:\/\//.test(avatar)) {
    return <img alt="" src={avatar} style={{ ...tileStyle, objectFit: 'cover' }} />;
  }
  return <span style={tileStyle}>{avatar}</span>;
};

const SubmitAgentPick = memo<SubmitAgentPickRenderProps>(({ pluginState }) => {
  const { t } = useTranslation('tool');
  const summaries = pluginState?.summaries ?? [];

  if (summaries.length === 0) return null;

  const installedCount = summaries.filter((s) => !s.skipped).length;
  const skippedCount = summaries.length - installedCount;

  return (
    <div className="flex flex-col gap-3">
      <span style={{ color: cssVar.colorTextSecondary, fontSize: 13 }}>
        {t('agentMarketplace.inspector.pickCount', { count: installedCount })}
        {skippedCount > 0 &&
          ` · ${t('agentMarketplace.render.alreadyInLibrary', { count: skippedCount })}`}
      </span>
      <div className={styles.list}>
        {summaries.map((summary) => (
          <div
            className={cx(styles.card, summary.skipped && styles.cardSkipped)}
            key={summary.templateId}
          >
            <AgentAvatar avatar={summary.avatar || '🤖'} />
            <div className="flex flex-col flex-1 gap-1" style={{ minWidth: 0 }}>
              <div className={styles.titleRow}>
                <span className={styles.title}>{summary.title || summary.templateId}</span>
                {summary.skipped && (
                  <span className={styles.skippedTag}>
                    {t('agentMarketplace.render.alreadyInLibraryTag')}
                  </span>
                )}
              </div>
              {summary.description && (
                <div className={styles.description}>{summary.description}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

SubmitAgentPick.displayName = 'SubmitAgentPick';

export default SubmitAgentPick;
