import { ClaudeCode, Codex } from '@lobehub/icons';
import type { HeteroSessionDigest } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import dayjs from 'dayjs';
import { Check, RotateCcw, X } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { Badge as Tag } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { baseName, fmtTokens, type ImportRowState, selectable, type SessionStatus } from './utils';

const styles = createStaticStyles(({ css, cssVar }) => ({
  row: css`
    padding-block: 10px;
    padding-inline: 16px;
    border-radius: ${cssVar.borderRadius};

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  rowDim: css`
    opacity: 0.45;
  `,
}));

const BRAND = { 'claude-code': ClaudeCode, 'codex': Codex } as const;

const StatusTag = memo<{ status: SessionStatus }>(({ status }) => {
  const { t } = useTranslation('topic');
  switch (status) {
    case 'syncable': {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <Tag size="sm" variant="info-light">
                    {t('heteroImport.badge.syncable')}
                  </Tag>
                </span>
              }
            />
            <TooltipContent>{t('heteroImport.badge.syncableTip')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    case 'imported': {
      return <Tag size="sm">{t('heteroImport.badge.imported')}</Tag>;
    }
    case 'linked': {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <Tag size="sm">{t('heteroImport.badge.linked')}</Tag>
                </span>
              }
            />
            <TooltipContent>{t('heteroImport.badge.linkedTip')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    default: {
      return null;
    }
  }
});

const ImportState = memo<{ onRetry: () => void; showRetry: boolean; state?: ImportRowState }>(
  ({ state, showRetry, onRetry }) => {
    const { t } = useTranslation('topic');
    if (!state || state === 'pending')
      return (
        <div className="text-[12px] text-muted-foreground">{t('heteroImport.state.pending')}</div>
      );
    if (state === 'running')
      return (
        <div className="flex items-center gap-1.5">
          <NeuralNetworkLoading size={14} />
          <div className="text-[12px] text-muted-foreground">{t('heteroImport.state.running')}</div>
        </div>
      );
    if (state.ok)
      return (
        <div className="flex items-center gap-1">
          <Check size={14} style={{ color: 'var(--lobe-color-success, #52c41a)' }} />
          <div className="text-[12px] text-success">
            {t('heteroImport.state.inserted', { count: state.inserted })}
          </div>
        </div>
      );
    if (showRetry)
      return (
        <Button size="sm" onClick={onRetry}>
          <RotateCcw size={13} />
          {t('heteroImport.retry')}
        </Button>
      );
    return (
      <div className="flex items-center gap-1">
        <X size={14} style={{ color: 'var(--lobe-color-error, #ff4d4f)' }} />
        <div className="text-[12px] text-destructive">{t('heteroImport.state.failed')}</div>
      </div>
    );
  },
);

export interface SessionListItem {
  digest: HeteroSessionDigest;
  status: SessionStatus;
}

interface SessionRowProps {
  checked: boolean;
  importing: boolean;
  importState?: ImportRowState;
  item: SessionListItem;
  onRetry: (sessionId: string) => void;
  onToggle: (sessionId: string) => void;
  showDir: boolean;
  showRetry: boolean;
}

export const SessionRow = memo<SessionRowProps>(
  ({ item, checked, importing, importState, onRetry, onToggle, showDir, showRetry }) => {
    const { t } = useTranslation('topic');
    const { digest, status } = item;
    const canPick = selectable(status) && !importing;
    const dim = !selectable(status);
    const Brand = BRAND[digest.source];

    return (
      <div
        className={cx(cx(styles.row, dim && styles.rowDim), 'flex items-center gap-3')}
        data-session-row={digest.sessionId}
        style={{ cursor: canPick ? 'pointer' : 'default' }}
        onClick={() => canPick && onToggle(digest.sessionId)}
      >
        {!importing && (
          <Checkbox
            checked={checked}
            disabled={!selectable(status)}
            onCheckedChange={() => onToggle(digest.sessionId)}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <div className="flex flex-col gap-0.5" style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2">
            {showDir && <Brand size={13} style={{ flex: 'none', opacity: 0.75 }} />}
            <div className="truncate block">
              {digest.title || digest.firstPrompt || digest.sessionId}
            </div>
            <StatusTag status={status} />
          </div>
          <div className="flex items-center gap-2.5">
            {digest.endAt && (
              <div className="text-[12px] text-muted-foreground">
                {dayjs(digest.endAt).format('MM-DD HH:mm')}
              </div>
            )}
            <div className="text-[12px] text-muted-foreground">
              {t('heteroImport.meta.messages', { count: digest.messageCount })}
            </div>
            {digest.tokens ? (
              <div className="text-[12px] text-muted-foreground">
                {t('heteroImport.meta.tokens', { tokens: fmtTokens(digest.tokens) })}
              </div>
            ) : null}
            {digest.gitBranch && (
              <div className="truncate block text-[12px] text-muted-foreground">
                {digest.gitBranch}
              </div>
            )}
            {showDir && (
              <div className="text-[12px] text-muted-foreground">
                {baseName(digest.workingDirectory ?? '')}
              </div>
            )}
          </div>
        </div>
        {importing && (
          <ImportState
            showRetry={showRetry}
            state={importState}
            onRetry={() => onRetry(digest.sessionId)}
          />
        )}
      </div>
    );
  },
);
