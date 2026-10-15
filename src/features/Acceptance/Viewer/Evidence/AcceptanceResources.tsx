'use client';

import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import { cn } from 'cn';
import { FileText, Film, Paperclip } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { Image } from '@/components/ImagePreview';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { useIsHydrated } from '@/hooks/useIsHydrated';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { useAcceptanceScope } from '../AcceptanceScope';
import { checksForTurn } from '../turnChecks';
import { useAcceptanceBundle } from '../useAcceptanceBundle';
import { useAcceptanceTurn } from '../useAcceptanceTurn';
import styles from './AcceptanceResources.module.css';

// Match the existing application Grid defaults, including inclusive boundaries.
// AppTheme does not expose breakpoint overrides; SSR keeps the former three-column snapshot.
const COLUMN_QUERIES = ['(min-width: 768px)', '(min-width: 992px)'] as const;

const subscribeColumns = (onChange: () => void) => {
  const queries = COLUMN_QUERIES.map((query) => window.matchMedia(query));
  queries.forEach((query) => query.addEventListener?.('change', onChange));
  return () => queries.forEach((query) => query.removeEventListener?.('change', onChange));
};

const getColumnsSnapshot = () =>
  window.matchMedia(COLUMN_QUERIES[1]).matches
    ? 3
    : window.matchMedia(COLUMN_QUERIES[0]).matches
      ? 2
      : 1;

const getServerColumnsSnapshot = () => 3;

const isVisual = (type: string) => type === 'screenshot' || type === 'gif';

/**
 * Everything this acceptance produced, in one place.
 *
 * The artefacts exist already — every round attaches them to the check whose
 * verdict they back — but reaching one meant knowing which check owned it and
 * expanding that row. The same artefact is also what you want when you are NOT
 * auditing a verdict ("where is that screenshot"), so it earns an inventory of
 * its own. Deduped by file: a carried-forward check re-attaches the same
 * artefact to every round it survives.
 */
const AcceptanceResources = () => {
  const { t } = useTranslation('verify');
  const columnCount = useSyncExternalStore(
    subscribeColumns,
    getColumnsSnapshot,
    getServerColumnsSnapshot,
  );
  const hydrated = useIsHydrated();
  const { acceptanceId, embedded } = useAcceptanceScope();
  const { turn } = useAcceptanceTurn(embedded);
  const { data } = useAcceptanceBundle(acceptanceId);
  if (!data) return null;

  const seen = new Set<string>();
  const items = checksForTurn(data, turn)
    .flatMap((check) =>
      (check.evidence ?? []).map((evidence) => ({ check: check.title, evidence })),
    )
    .filter(({ evidence }) => {
      const key = evidence.fileId ?? evidence.documentId ?? evidence.id;
      if (!key || seen.has(key)) return false;
      // Text captured inline is the check's own body, not a file someone can
      // open — listing it here would pad the inventory with dead tiles.
      if (!evidence.fileUrl && !evidence.documentId) return false;
      seen.add(key);
      return true;
    });

  if (items.length === 0)
    return (
      <div className="flex flex-col py-8">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant={'icon'}>
              <Paperclip />
            </EmptyMedia>
            <EmptyDescription>{t('acceptance.resources.empty')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );

  const columns: (typeof items)[] = Array.from({ length: columnCount }, () => []);
  items.forEach((entry, index) => columns[index % columnCount]!.push(entry));

  return (
    <div className="flex items-start gap-3">
      {columns.map((column, columnIndex) => (
        <div className="flex flex-1 flex-col gap-3 [min-inline-size:0]" key={columnIndex}>
          {column.map(({ check, evidence }) => {
            const href = evidence.fileUrl ?? undefined;
            const name = evidence.fileName ?? evidence.description ?? check;
            const captured =
              hydrated && evidence.capturedAt
                ? formatAbsoluteDateTime(evidence.capturedAt)
                : undefined;
            const visual = isVisual(evidence.type) && Boolean(evidence.fileUrl);

            return (
              <div
                {...clickableProps(href)}
                key={evidence.id}
                className={cn(
                  'cursor-pointer overflow-hidden [inline-size:100%] border border-solid border-divider rounded-(--radius-card) bg-card hover:border-border',
                  CLICKABLE_FOCUS_RING,
                )}
                onClick={href ? () => window.open(href, '_blank', 'noreferrer') : undefined}
              >
                {visual ? (
                  /* The ratio is reserved from the stored dimensions, not left to
                 the image's own load: CSS columns balance once, at layout, and
                 an image that arrives afterwards has already lost its place —
                 every tile piles into the first column. */
                  <div
                    className="w-full bg-fill-quaternary"
                    style={{
                      aspectRatio:
                        evidence.fileWidth && evidence.fileHeight
                          ? `${evidence.fileWidth} / ${evidence.fileHeight}`
                          : '16 / 10',
                    }}
                  >
                    <Image
                      alt={name}
                      className={styles.image}
                      preview={false}
                      src={evidence.fileUrl!}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 py-4.5 px-3 bg-fill-quaternary">
                    {evidence.type === 'video' ? (
                      <Film className="text-foreground-tertiary" size={16} />
                    ) : (
                      <FileText className="text-foreground-tertiary" size={16} />
                    )}
                    <div className="truncate min-w-0 text-sm leading-5.5">{name}</div>
                  </div>
                )}
                <div className="flex flex-col gap-0.5 py-2 px-2.5">
                  <div className="truncate min-w-0 text-xs leading-5">{name}</div>
                  <div className="truncate min-w-0 text-xs leading-5 text-muted-foreground">
                    {[check, captured].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default AcceptanceResources;
