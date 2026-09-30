'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Badge } from '@/components/reui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import { previewSections } from '../helpers';
import { useExpertiseLesson } from '../hooks';

const styles = createStaticStyles(({ css }) => ({
  root: css`
    /*
     * A row near the fold leaves less room below it than the card wants. base-ui publishes the
     * space it actually has as --available-height; without this the card runs past the viewport
     * and its evidence and click hint become unreachable.
     */
    overflow-y: auto;
    width: 380px;
    max-width: min(380px, calc(100vw - 32px));

    /* less the popup's own chrome, which sits outside this element */

    /*
     * The card prefers the space below the row but flips above when that runs out, so this
     * tracks whichever side Base UI actually chose rather than assuming one of them.
     */
    max-height: calc(var(--available-height, 100dvh) - 16px);
  `,
  section: css`
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 12px;
    align-items: baseline;
  `,
  separator: css`
    flex: none;
    height: 1px;
    background: ${cssVar.colorBorderSecondary};
  `,
  retry: css`
    cursor: pointer;
    align-self: flex-start;
    border: 0;
    background: none;
  `,
  open: css`
    flex: none;
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    white-space: nowrap;

    &:hover {
      color: ${cssVar.colorText};
    }
  `,
  title: css`
    text-wrap: balance;
  `,
}));

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
    <div className={cx(styles.root, 'flex flex-col gap-2.5 p-1')}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3 justify-between">
          <div className="text-[12px] text-muted-foreground font-semibold">
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
        <div className={cn('text-[15px] font-semibold', styles.title)} style={{ lineHeight: 1.45 }}>
          {title}
        </div>
        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          <div className="text-[12px] text-muted-foreground">
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
            <Badge size="sm" variant="secondary">
              {layer}
            </Badge>
          )}
        </div>
      </div>

      {isLoading && !data && (
        <div className="flex flex-col gap-2">
          <Skeleton style={{ height: 13 }} />
          <Skeleton style={{ height: 13 }} />
          <Skeleton style={{ height: 13, width: '60%' }} />
        </div>
      )}

      {/* Without this the card sits on "loading…" forever: SWR clears isLoading on failure. */}
      {!!error && !data && (
        <button className={cn('text-[12px] text-info', styles.retry)} onClick={() => void mutate()}>
          {t('rules.detail.retry')}
        </button>
      )}

      {sections.length > 0 && (
        <>
          <div className={styles.separator} />
          <div className="flex flex-col gap-2">
            {sections.map(({ label, ...section }) => (
              <div className={styles.section} key={section.key}>
                <div className="text-[12px] text-muted-foreground font-semibold">
                  {label ? t(label) : section.key}
                </div>
                <div className="line-clamp-3" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                  {section.body}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {evidence.length > 0 && (
        <>
          <div className={styles.separator} />
          <div className="flex flex-col gap-1.5">
            <div className="text-[12px] text-muted-foreground font-semibold">
              {t('rules.detail.examples')}
            </div>
            {evidence.map((hit, index) => (
              <div className="flex items-start gap-2" key={`${hit.createdAt}-${index}`}>
                <div
                  style={{ flex: 'none' }}
                  className={cn(
                    'text-[12px]',
                    hit.outcome === 'pass' ? 'text-muted-foreground' : 'text-warning',
                  )}
                >
                  {t(`rules.detail.outcome.${hit.outcome}`)}
                </div>
                <div className="text-[12px] line-clamp-2 text-muted-foreground">{hit.example}</div>
              </div>
            ))}
            {data && data.hits.length > MAX_EVIDENCE && (
              <div className="text-[12px] text-muted-foreground">
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
