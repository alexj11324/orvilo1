'use client';

import { cn } from 'cn';
import {
  FileOutputIcon,
  ImageIcon,
  KeyRoundIcon,
  LinkIcon,
  LockIcon,
  PaperclipIcon,
  WrenchIcon,
} from 'lucide-react';
import { type ReactNode } from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { confirmModal } from '@/components/Modal';
import { ArticleSkeleton } from '@/components/Skeleton';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePermission } from '@/hooks/usePermission';
import { useTopicSharePermission } from '@/hooks/useTopicSharePermission';
import { shareKeys } from '@/libs/swr/keys';
import { topicService } from '@/services/topic';
import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { copyToClipboard } from '@/utils/clipboard';

import { styles } from './style';

type Visibility = 'private' | 'link';

const PRIVACY_WARNING_ITEMS = [
  { icon: WrenchIcon, labelKey: 'shareModal.popover.privacyWarning.items.toolCalls' },
  { icon: KeyRoundIcon, labelKey: 'shareModal.popover.privacyWarning.items.credentials' },
  { icon: ImageIcon, labelKey: 'shareModal.popover.privacyWarning.items.images' },
  { icon: PaperclipIcon, labelKey: 'shareModal.popover.privacyWarning.items.files' },
] as const;

interface SharePopoverContentProps {
  /** Owner of the topic — carries the agent-level topic-share policy. */
  agentId?: string;
  onClose?: () => void;
  onOpenModal?: () => void;
  topicId?: string;
}

const SharePopoverContent = memo<SharePopoverContentProps>(
  ({ agentId, onClose, onOpenModal, topicId }) => {
    const { t } = useTranslation('chat');

    const [updating, setUpdating] = useState(false);
    const close = useCallback(() => onClose?.(), [onClose]);
    const containerRef = useRef<HTMLDivElement>(null);
    const appOrigin = useAppOrigin();
    const { allowed: canShare, reason } = usePermission('edit_own_content');
    // Narrower than `canShare`: publishing a link may be reserved to the agent's
    // creator and workspace owners. Export and revoking stay open to everyone who
    // can reach this popover at all.
    const { allowed: canPublishLink, reason: publishRestrictedReason } =
      useTopicSharePermission(agentId);

    const chatActiveTopicId = useChatStore((s) => s.activeTopicId);
    const activeTopicId = topicId ?? chatActiveTopicId;
    const [hideTopicSharePrivacyWarning, updateSystemStatus] = useGlobalStore((s) => [
      systemStatusSelectors.systemStatus(s).hideTopicSharePrivacyWarning ?? false,
      s.updateSystemStatus,
    ]);

    // Scoped to the topic that failed: the popover is reused across topics, so a
    // sticky boolean would keep showing the error on the next one.
    const [failedTopicId, setFailedTopicId] = useState<string>();
    const {
      data: shareInfo,
      error: loadError,
      isLoading,
      mutate,
    } = useSWR(
      activeTopicId && canShare ? shareKeys.topicInfo(activeTopicId) : null,
      () => topicService.getShareInfo(activeTopicId!),
      { revalidateOnFocus: false },
    );

    // Auto-create share record if not exists. Surface failures (e.g. a 403 from
    // the share permission gate) instead of leaving the popover on the skeleton.
    // Skipped entirely when the caller cannot publish: the placeholder is of no
    // use to them, and under a restricted agent the server would refuse it.
    useEffect(() => {
      if (isLoading || loadError || shareInfo || !activeTopicId || !canShare || !canPublishLink)
        return;
      // One attempt per topic — a rerender must not retry a create we know failed.
      if (failedTopicId === activeTopicId) return;

      topicService
        .enableSharing(activeTopicId, 'private')
        .then(() => mutate())
        .catch(() => setFailedTopicId(activeTopicId));
    }, [
      isLoading,
      loadError,
      shareInfo,
      activeTopicId,
      canShare,
      canPublishLink,
      failedTopicId,
      mutate,
    ]);

    const shareUrl = shareInfo?.id ? `${appOrigin}/share/t/${shareInfo.id}` : '';
    const currentVisibility = (shareInfo?.visibility as Visibility) || 'private';

    const updateVisibility = useCallback(
      async (visibility: Visibility) => {
        if (!activeTopicId) return;

        setUpdating(true);
        try {
          await topicService.updateShareVisibility(activeTopicId, visibility);
          await mutate();
          // Auto-copy the share link the moment link sharing is enabled
          if (visibility === 'link' && shareUrl) {
            await copyToClipboard(shareUrl);
            toast.success(t('shareModal.copyLinkSuccess'));
          } else {
            toast.success(t('shareModal.link.visibilityUpdated'));
          }
        } catch {
          toast.error(t('shareModal.link.updateError'));
        } finally {
          setUpdating(false);
        }
      },
      [activeTopicId, mutate, t, shareUrl],
    );

    const handleVisibilityChange = useCallback(
      (visibility: Visibility) => {
        // The `link` option is already disabled in that case; this is the guard
        // that keeps a keyboard selection from racing past it.
        if (visibility === 'link' && !canPublishLink) return;

        // Show confirmation when changing from private to link (unless user has dismissed it)
        if (
          currentVisibility === 'private' &&
          visibility === 'link' &&
          !hideTopicSharePrivacyWarning
        ) {
          let doNotShowAgain = false;

          confirmModal({
            cancelText: t('cancel', { ns: 'common' }),
            content: (
              <div className="flex flex-col gap-4">
                <div>{t('shareModal.popover.privacyWarning.content')}</div>
                <div className="flex flex-col gap-3 py-2">
                  {PRIVACY_WARNING_ITEMS.map(({ icon: ItemIcon, labelKey }) => (
                    <div className="flex flex-row items-center gap-2" key={labelKey}>
                      <ItemIcon size={16} />
                      <div>{t(labelKey)}</div>
                    </div>
                  ))}
                </div>
                <div>{t('shareModal.popover.privacyWarning.note')}</div>
                <label className="flex items-center gap-2">
                  <Checkbox
                    onCheckedChange={(v) => {
                      doNotShowAgain = v === true;
                    }}
                  />
                  {t('shareModal.popover.privacyWarning.doNotShowAgain')}
                </label>
              </div>
            ),
            okText: t('shareModal.popover.privacyWarning.confirm'),
            onOk: () => {
              if (doNotShowAgain) {
                updateSystemStatus({ hideTopicSharePrivacyWarning: true });
              }
              updateVisibility(visibility);
            },
            title: t('shareModal.popover.privacyWarning.title'),
          });
        } else {
          updateVisibility(visibility);
        }
      },
      [
        canPublishLink,
        currentVisibility,
        hideTopicSharePrivacyWarning,
        t,
        updateSystemStatus,
        updateVisibility,
      ],
    );

    const handleCopyLink = useCallback(async () => {
      if (!shareUrl) return;
      await copyToClipboard(shareUrl);
      toast.success(t('shareModal.copyLinkSuccess'));
    }, [shareUrl, t]);

    const handleOpenModal = useCallback(() => {
      close();
      onOpenModal?.();
    }, [close, onOpenModal]);

    // Clearing the per-topic failure re-arms the create effect; `mutate` reruns
    // the read so a transient load error clears with it.
    const handleRetry = useCallback(() => {
      setFailedTopicId(undefined);
      void mutate();
    }, [mutate]);

    if (!canShare) {
      return (
        <div className={cn('flex flex-col gap-2', styles.container)}>
          <div className="font-semibold">{t('share', { ns: 'common' })}</div>
          <div className="text-muted-foreground">{reason}</div>
        </div>
      );
    }

    if (loadError || failedTopicId === activeTopicId) {
      return (
        <div className={cn('flex flex-col gap-2', styles.container)}>
          <div className="font-semibold">{t('share', { ns: 'common' })}</div>
          <div className="text-muted-foreground">{t('shareModal.popover.loadError')}</div>
          <div className="flex flex-row justify-end">
            <Button size="sm" variant="ghost" onClick={handleRetry}>
              {t('retry', { ns: 'common' })}
            </Button>
          </div>
        </div>
      );
    }

    // Loading state. Without a share record a restricted caller still gets the
    // real body (visibility defaults to private) instead of an eternal skeleton.
    if (isLoading || (!shareInfo && canPublishLink)) {
      return (
        <div className={cn('flex flex-col gap-4', styles.container)}>
          <div className="font-semibold">{t('share', { ns: 'common' })}</div>
          <ArticleSkeleton rows={2} />
        </div>
      );
    }

    const visibilityOptions = [
      {
        icon: <LockIcon size={14} />,
        label: t('shareModal.link.permissionPrivate'),
        value: 'private',
      },
      {
        disabled: !canPublishLink,
        icon: <LinkIcon size={14} />,
        label: t('shareModal.link.permissionLink'),
        value: 'link',
      },
    ];

    const getVisibilityHint = () => {
      // Why the link option is greyed out matters more than restating what
      // "private" means — a member who can't publish needs to know who to ask.
      if (!canPublishLink && currentVisibility === 'private') return publishRestrictedReason;

      switch (currentVisibility) {
        case 'private': {
          return t('shareModal.link.privateHint');
        }
        case 'link': {
          return t('shareModal.link.linkHint');
        }
      }
    };

    return (
      <div className={cn('flex flex-col gap-3', styles.container)} ref={containerRef}>
        <div className="font-semibold">{t('shareModal.popover.title')}</div>

        <div className="flex flex-col gap-1">
          <div className="text-muted-foreground">{t('shareModal.popover.visibility')}</div>
          <Select
            disabled={updating}
            value={currentVisibility}
            onValueChange={(v) => handleVisibilityChange(v as Visibility)}
          >
            <SelectTrigger style={{ width: '100%' }}>
              <SelectValue>
                {(value) => {
                  const option = visibilityOptions.find((o) => o.value === value);
                  return (
                    <div className="flex flex-row items-center gap-2">
                      {option?.icon}
                      {option?.label}
                    </div>
                  );
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {visibilityOptions.map((option) => (
                <SelectItem disabled={option.disabled} key={option.value} value={option.value}>
                  <div className="flex flex-row items-center gap-2">
                    {option.icon}
                    {option.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={cn('text-muted-foreground', styles.hint)}>{getVisibilityHint()}</div>

        <Separator style={{ margin: '4px 0' }} />

        <div className="flex flex-row items-center justify-between">
          <Button size="sm" variant="ghost" onClick={handleOpenModal}>
            <FileOutputIcon data-icon="inline-start" />
            {t('shareModal.popover.export')}
          </Button>
          {currentVisibility !== 'private' && (
            <Button size="sm" onClick={handleCopyLink}>
              <LinkIcon data-icon="inline-start" />
              {t('shareModal.copyLink')}
            </Button>
          )}
        </div>
      </div>
    );
  },
);

interface SharePopoverProps {
  /** Owner of the topic — carries the agent-level topic-share policy. */
  agentId?: string;
  children?: ReactNode;
  onOpenModal?: () => void;
  topicId?: string;
}

const SharePopover = memo<SharePopoverProps>(({ agentId, children, onOpenModal, topicId }) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<span />}>{children}</PopoverTrigger>
      <PopoverContent
        align={isMobile ? 'center' : 'end'}
        className="p-0"
        side={isMobile ? 'top' : 'bottom'}
        style={{ width: isMobile ? '100vw' : 366 }}
      >
        <SharePopoverContent
          agentId={agentId}
          topicId={topicId}
          onClose={() => setOpen(false)}
          onOpenModal={onOpenModal}
        />
      </PopoverContent>
    </Popover>
  );
});

export default SharePopover;
