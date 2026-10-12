'use client';

import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import { previewSections } from '../helpers';
import { useExpertiseLesson } from '../hooks';

const styles = {
  // Preserve the public Popup's available-height bound and exact380px preview cap.
  root: 'overflow-y-auto w-[380px] max-w-[min(380px,calc(100vw-32px))] max-h-[calc(var(--available-height,100dvh)-16px)]',
  section: 'grid grid-cols-[56px_minmax(0,1fr)] gap-3 items-baseline',
  separator: 'flex-none h-px bg-divider',
  retry: 'cursor-pointer self-start border-0 bg-transparent',
  open: 'flex-none text-xs leading-5 text-muted-foreground whitespace-nowrap hover:text-foreground',
  title: '[text-wrap:balance]',
};

/** Kept low so the card fits beside the row it describes; the rest is one line away. */
const MAX_EVIDENCE = 2;

interface LessonPreviewProps {
  /** Carried from the list row so the card has a header before the fetch lands. */
  code: string;
  layer?: string | null;
  lessonId: string;
  /** The card outlives the pointer leaving the row, so it carries its own way in. */
  lessonPath: string;
  title: string;
}

/**
 * 悬停一条经验时展开的预览卡。
 *
 * 清单一行只放得下「标题 + 靠不靠谱」，但要判断一条经验是否可信，看的是它的理由和用法 ——
 * 那些原来得逐条点进详情页。这里按需拉同一份详情（SWR 缓存，真点进去时不会再请求一次），
 * 只截取判断需要的部分：为什么、怎么用、最近在哪几次实践里验证过。
 */
const LessonPreview = memo<LessonPreviewProps>(({ code, layer, lessonId, lessonPath, title }) => {
  const { t } = useTranslation('selfLearning');
  const navigate = useWorkspaceAwareNavigate();
  const { data, error, isLoading, mutate } = useExpertiseLesson(lessonId);

  const sections = previewSections(data?.lesson.sections);
  const evidence = data?.hits.slice(0, MAX_EVIDENCE) ?? [];

  return (
    <div className={cn(styles.root, 'flex flex-col gap-2.5 p-1')}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3 justify-between">
          <div className="text-xs text-muted-foreground font-semibold">
            {t('rules.detail.eyebrow', { code })}
          </div>
          {/* The row underneath is no longer under the pointer once it moves in here. */}
          <Link
            className={styles.open}
            to={lessonPath}
            onClick={(event) => {
              event.preventDefault();
              navigate(lessonPath);
            }}
          >
            {t('preview.open')}
          </Link>
        </div>
        <div className={cn('text-sm leading-5.5 font-semibold', styles.title)}>{title}</div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs text-muted-foreground">
            {data
              ? t('rules.detail.meta', {
                  hits: data.lesson.hitCount,
                  runs: data.lesson.hitRunCount,
                })
              : error
                ? t('preview.failed')
                : t('preview.loading')}
          </div>
          {layer && (
            <Badge className="rounded-(--radius-chip)" size="sm" variant="secondary">
              {layer}
            </Badge>
          )}
        </div>
      </div>

      {isLoading && !data && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5" />
          <Skeleton className="h-3.5" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      )}

      {/* Without this the card sits on "loading…" forever: SWR clears isLoading on failure. */}
      {!!error && !data && (
        <Button
          className={cn('text-sm leading-5.5 text-info-text', styles.retry)}
          size="normal"
          type="button"
          variant="link"
          onClick={() => void mutate()}
        >
          {t('rules.detail.retry')}
        </Button>
      )}

      {sections.length > 0 && (
        <>
          <div className={styles.separator} />
          <div className="flex flex-col gap-2">
            {sections.map(({ label, ...section }) => (
              <div className={styles.section} key={section.key}>
                <div className="text-xs text-muted-foreground font-semibold">
                  {label ? t(label) : section.key}
                </div>
                <div className="text-sm leading-5.5 line-clamp-3">{section.body}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {evidence.length > 0 && (
        <>
          <div className={styles.separator} />
          <div className="flex flex-col gap-1.5">
            <div className="text-xs text-muted-foreground font-semibold">
              {t('rules.detail.examples')}
            </div>
            {evidence.map((hit, index) => (
              <div className="flex items-start gap-2" key={`${hit.createdAt}-${index}`}>
                <div
                  className={cn(
                    'flex-none text-xs leading-5',
                    hit.outcome === 'pass' ? 'text-muted-foreground' : 'text-warning-text',
                  )}
                >
                  {t(`rules.detail.outcome.${hit.outcome}`)}
                </div>
                <div className="text-xs line-clamp-2 text-muted-foreground">{hit.example}</div>
              </div>
            ))}
            {data && data.hits.length > MAX_EVIDENCE && (
              <div className="text-xs text-muted-foreground">
                {t('preview.moreEvidence', { count: data.hits.length - MAX_EVIDENCE })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});

LessonPreview.displayName = 'ExpertiseLessonPreview';

export default LessonPreview;
