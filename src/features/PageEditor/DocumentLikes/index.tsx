'use client';

import type { DocumentLikeSummary } from '@orvilo/types';
import { cn } from 'cn';
import { ThumbsUp } from 'lucide-react';
import { memo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useClientDataSWR } from '@/libs/swr';
import { documentLikeKeys } from '@/libs/swr/keys';
import { documentLikeService } from '@/services/documentLike';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

const BUTTON_SIZE = 40;
const ICON_SIZE = 16;

const styles = {
  avatars: 'flex-wrap justify-center max-w-150 min-h-8',
  button:
    "relative w-10 p-0 rounded-full border-primary bg-transparent text-primary-text hover:bg-primary-wash aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-on-fill aria-pressed:hover:bg-primary-hover aria-pressed:hover:text-primary-hover-foreground coarse:after:absolute coarse:after:-inset-0.5 coarse:after:content-['']",
  caption:
    "flex items-center gap-4 text-xs leading-5 text-muted-foreground whitespace-nowrap before:content-[''] before:w-10 before:h-px before:bg-divider after:content-[''] after:w-10 after:h-px after:bg-divider",
  section: 'w-full mbs-8',
};

const useDocumentLikeSummary = (workspaceId: string | null, documentId?: string | null) =>
  useClientDataSWR<DocumentLikeSummary>(
    workspaceId && documentId ? documentLikeKeys.summary(workspaceId, documentId) : null,
    () => documentLikeService.summary(documentId!),
    { dedupingInterval: 30_000 },
  );

const DocumentLikes = memo<{ documentId: string }>(({ documentId }) => {
  const { t } = useTranslation('file');
  const workspaceId = useActiveWorkspaceId();
  const user = useUserStore(userProfileSelectors.userProfile);
  const { data, error, isLoading, mutate } = useDocumentLikeSummary(workspaceId, documentId);
  // Last user-intended liked state; null when the UI matches the server.
  const targetRef = useRef<boolean | null>(null);
  const inFlightRef = useRef(false);

  // Send requests until the server state matches the latest intent. Clicks
  // landing while a request is in flight only update targetRef (the UI already
  // flipped optimistically), so every click responds instantly and a rapid
  // like→unlike coalesces into sequential calls instead of being dropped.
  const drain = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    let sent: boolean | undefined;
    try {
      let summary: DocumentLikeSummary | undefined;
      while (targetRef.current !== null && targetRef.current !== sent) {
        sent = targetRef.current;
        summary = sent
          ? await documentLikeService.like(documentId)
          : await documentLikeService.unlike(documentId);
      }
      targetRef.current = null;
      if (summary) await mutate(summary, { revalidate: false });
    } catch (toggleError) {
      console.error('Failed to toggle document like', toggleError);
      targetRef.current = null;
      toast.error(t('pageEditor.likes.failed'));
      // Recover the truth from the server rather than guessing a rollback
      // point across coalesced toggles. The recovery fetch itself can fail
      // (e.g. an outage) — swallow it so drain() never rejects out of a void
      // call; SWR revalidates again on the next focus/interval and corrects
      // any stale optimistic state then.
      await mutate().catch(() => undefined);
    } finally {
      inFlightRef.current = false;
    }
  }, [documentId, mutate, t]);

  const toggle = useCallback(() => {
    if (!data) return;

    const nextLiked = !(targetRef.current ?? data.liked);
    targetRef.current = nextLiked;

    void mutate(
      (previous) => {
        if (!previous) return previous;
        return nextLiked
          ? {
              liked: true,
              likers: [
                {
                  avatar: user?.avatar ?? null,
                  fullName: user?.fullName ?? null,
                  id: user?.id ?? 'me',
                  username: user?.username ?? null,
                },
                ...previous.likers.filter((liker) => liker.id !== (user?.id ?? 'me')),
              ],
              total: previous.total + 1,
            }
          : {
              liked: false,
              likers: previous.likers.filter((liker) => liker.id !== (user?.id ?? 'me')),
              total: Math.max(0, previous.total - 1),
            };
      },
      { revalidate: false },
    );
    void drain();
  }, [data, drain, mutate, user?.avatar, user?.fullName, user?.id, user?.username]);

  if (!workspaceId) return null;

  // A failed initial load must not masquerade as a zero-like page: surface a
  // retryable error instead of the idle state with a dead button.
  if (!data && error)
    return (
      <div data-document-likes className={cn('flex flex-col items-center gap-4', styles.section)}>
        <AsyncError error={error} variant={'inline'} onRetry={() => void mutate()} />
      </div>
    );

  // Match the surrounding page skeleton while the summary loads instead of
  // flashing the finished idle state ahead of the rest of the content.
  if (isLoading && !data)
    return (
      <div data-document-likes className={cn('flex flex-col items-center gap-4', styles.section)}>
        <Skeleton className="rounded-full" style={{ height: BUTTON_SIZE, width: BUTTON_SIZE }} />
        <Skeleton style={{ height: 20, width: 200 }} />
      </div>
    );

  const liked = data?.liked ?? false;
  const likers = data?.likers ?? [];
  const total = data?.total ?? 0;
  const overflow = Math.max(0, total - likers.length);
  // The filled button already says "you liked this"; the caption only carries
  // the count (or the invite copy while nobody has liked yet).
  const label =
    total > 0 ? t('pageEditor.likes.count', { count: total }) : t('pageEditor.likes.like');
  const ariaLabel = liked ? t('pageEditor.likes.liked') : t('pageEditor.likes.like');

  return (
    <div
      data-document-likes
      className={cn('flex flex-col items-center gap-4', styles.section)}
      onClick={(event) => event.stopPropagation()}
    >
      <Button
        aria-label={ariaLabel}
        aria-pressed={liked}
        className={styles.button}
        disabled={isLoading || !data}
        size="large"
        type={'button'}
        variant="outline"
        onClick={() => void toggle()}
      >
        <ThumbsUp
          fill={liked ? 'currentColor' : 'none'}
          size={ICON_SIZE}
          strokeWidth={liked ? 0 : 1.5}
        />
      </Button>
      <span className={styles.caption}>
        <span className="text-xs leading-5 text-inherit">{label}</span>
      </span>
      {(likers.length > 0 || overflow > 0) && (
        <div className={cn('flex gap-2', styles.avatars)}>
          {likers.map((liker) => {
            const name = liker.fullName || liker.username || liker.id;
            return (
              <TooltipProvider key={liker.id}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span style={{ display: 'inline-flex' }}>
                        <Avatar avatar={liker.avatar || name} size={32} />
                      </span>
                    }
                  />
                  <TooltipContent>{name}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
          {overflow > 0 && (
            <div className="text-xs leading-5 text-muted-foreground">
              {t('pageEditor.likes.more', { count: overflow })}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

DocumentLikes.displayName = 'DocumentLikes';

export default DocumentLikes;
