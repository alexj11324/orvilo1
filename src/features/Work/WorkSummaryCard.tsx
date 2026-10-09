'use client';

import type { WorkSummaryItem } from '@orvilo/types';
import { formatUsageValue } from '@orvilo/utils';
import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { CircleDollarSignIcon, CoinsIcon } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useChatStore } from '@/store/chat';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';
import { getWorkVersionTotalTokens } from '@/utils/workCumulativeUsage';
import { formatWorkVersionCost } from '@/utils/workVersionCost';

import { getWorkTypeDescriptor, isSafeExternalUrl } from './descriptors';
import { useResourceDeletedPrompt } from './useResourceDeletedPrompt';

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    overflow: hidden;

    width: 100%;
    padding-block: 12px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgElevated};
  `,
  clickable: css`
    cursor: pointer;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  cost: css`
    flex-shrink: 0;
    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  description: css`
    min-width: 0;
    color: ${cssVar.colorTextTertiary};
  `,
  identifier: css`
    flex-shrink: 0;
    color: ${cssVar.colorTextTertiary};
  `,
  icon: css`
    flex-shrink: 0;

    width: 36px;
    height: 36px;
    border-radius: 8px;

    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillTertiary};
  `,
  inline: css`
    overflow: hidden;

    width: 100%;
    padding-block: 8px;
    padding-inline: 8px;
    border-radius: 6px;

    transition: background-color 0.12s ease;
  `,
  inlineClickable: css`
    cursor: pointer;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  inlineCost: css`
    flex-shrink: 0;
    font-family: ${cssVar.fontFamilyCode};
    font-size: 11px;
    color: ${cssVar.colorTextTertiary};
  `,
  inlineDescription: css`
    min-width: 0;
    font-size: 11px;
    color: ${cssVar.colorTextTertiary};
  `,
  inlineIdentifier: css`
    flex-shrink: 0;
    font-family: ${cssVar.fontFamilyCode};
    font-size: 11px;
    color: ${cssVar.colorTextTertiary};
  `,
  inlineIcon: css`
    flex-shrink: 0;
    color: ${cssVar.colorTextSecondary};
  `,
  inlineTitle: css`
    min-width: 0;
    font-size: 13px;
    font-weight: 500;
  `,
  title: css`
    min-width: 0;
    font-size: 15px;
    font-weight: 500;
  `,
}));

interface WorkSummaryCardProps {
  className?: string;
  item: WorkSummaryItem;
  /**
   * Override the click target. The default opens the chat portal (task detail /
   * document), which only renders inside the conversation UI; surfaces without
   * that portal (e.g. the resource page's 产物 gallery) pass their own
   * navigation here. Only ever receives a clickable, non-orphaned item — the
   * card still gates clickability on external-url presence and routes
   * resource-deleted items to the deleted notice before reaching this.
   */
  onOpen?: (item: WorkSummaryItem) => void;
  /**
   * `card` (default) renders the elevated 36×36 icon-box layout used across the
   * chat portal and the works gallery. `inline` renders a flat row (17px icon,
   * 6px hover fill) for the WorkingSidebar Overview, so a shared card doesn't
   * dictate the flat sidebar's visual vocabulary.
   */
  variant?: 'card' | 'inline';
}

const WorkSummaryCard = memo<WorkSummaryCardProps>(
  ({ className, item, onOpen, variant = 'card' }) => {
    const { t } = useTranslation('chat');
    const openDocument = useChatStore((s) => s.openDocument);
    const openFilePreview = useChatStore((s) => s.openFilePreview);
    const openTaskDetail = useChatStore((s) => s.openTaskDetail);
    const promptResourceDeleted = useResourceDeletedPrompt();
    const cost = formatWorkVersionCost(item.totalCost);
    const totalTokens = getWorkVersionTotalTokens(item.event.cumulativeUsage);
    const usage = cost
      ? { icon: CircleDollarSignIcon, value: cost.slice(1) }
      : totalTokens
        ? { icon: CoinsIcon, value: formatUsageValue(totalTokens) }
        : null;
    const usageTitle = cost
      ? t('workingPanel.works.totalCost', { cost })
      : totalTokens
        ? `${totalTokens.toLocaleString()} ${t('opStatusTray.tokens')}`
        : undefined;

    const descriptor = getWorkTypeDescriptor(item);
    const Icon = descriptor.getIcon(item);
    const title =
      descriptor.getTitle(item)?.trim() ||
      descriptor.getIdentifier(item) ||
      item.resourceId ||
      item.id;
    // Mirrors WorkVersionHistoryCard's label: surface the resource identifier
    // (e.g. `QA-1989`, `owner/repo#2`) on the card itself, unless the title
    // already fell back to it.
    const identifier = descriptor.getIdentifier(item);
    const showIdentifier = !!identifier && identifier !== title;
    const description = descriptor.getDescription(item);
    const openTarget = descriptor.getOpenTarget(item);
    // The backing resource (task / document) was deleted outside the tool path:
    // the Work lingers as an orphan rendered from its snapshot, and opening the
    // gone resource 404s. The card keeps its normal look and a click explains
    // that the resource is gone and offers to remove the card.
    const resourceDeleted = item.resourceDeleted;
    const clickable = !!openTarget;

    const handleOpen = () => {
      if (resourceDeleted) {
        promptResourceDeleted(item);
        return;
      }
      if (onOpen) {
        onOpen(item);
        return;
      }
      if (!openTarget) return;

      switch (openTarget.kind) {
        case 'document': {
          openDocument(openTarget.documentId, openTarget.agentDocumentId);
          return;
        }
        case 'external': {
          // Defense in depth: only ever hand http(s) to shell.openExternal.
          if (isSafeExternalUrl(openTarget.url))
            window.open(openTarget.url, '_blank', 'noopener,noreferrer');
          return;
        }
        case 'filePreview': {
          openFilePreview({ fileId: openTarget.fileId });
          return;
        }
        case 'task': {
          openTaskDetail(openTarget.identifier);
        }
      }
    };

    if (variant === 'inline') {
      return (
        <div
          {...clickableProps(clickable)}
          className={cn(
            cx(
              'flex items-center gap-2.5',
              styles.inline,
              clickable && styles.inlineClickable,
              className,
            ),
            CLICKABLE_FOCUS_RING,
          )}
          onClick={clickable ? handleOpen : undefined}
        >
          <Icon className={styles.inlineIcon} size={17} />
          <div className="flex flex-1 flex-col gap-0.5" style={{ minWidth: 0 }}>
            <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
              <div className={cn('truncate min-w-0', styles.inlineTitle)}>{title}</div>
              {showIdentifier && <span className={styles.inlineIdentifier}>{identifier}</span>}
            </div>
            {description && (
              <div className={cn('truncate min-w-0', styles.inlineDescription)}>{description}</div>
            )}
          </div>
          {usage && (
            <div
              className={cx('flex items-center justify-center gap-0.5', styles.inlineCost)}
              title={usageTitle}
            >
              {createElement(usage.icon)}
              {usage.value}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        {...clickableProps(clickable)}
        className={cn(
          cx('flex items-center gap-3', styles.card, clickable && styles.clickable, className),
          CLICKABLE_FOCUS_RING,
        )}
        onClick={clickable ? handleOpen : undefined}
      >
        <div className={cx('flex flex-col items-center justify-center', styles.icon)}>
          <Icon size={18} />
        </div>
        <div className="flex flex-1 flex-col gap-0.5" style={{ minWidth: 0 }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
              <div className={cn('truncate min-w-0', styles.title)}>{title}</div>
              {showIdentifier && (
                <div
                  className={cn('font-mono rounded bg-muted px-1 text-[12px]', styles.identifier)}
                >
                  {identifier}
                </div>
              )}
            </div>
            {usage && (
              <div
                className={cx('flex items-center justify-center gap-0.5', styles.cost)}
                title={usageTitle}
              >
                {createElement(usage.icon)}
                {usage.value}
              </div>
            )}
          </div>
          {description && (
            <div className={cn('truncate min-w-0 text-[12px]', styles.description)}>
              {description}
            </div>
          )}
        </div>
      </div>
    );
  },
);

WorkSummaryCard.displayName = 'WorkSummaryCard';

export default WorkSummaryCard;
