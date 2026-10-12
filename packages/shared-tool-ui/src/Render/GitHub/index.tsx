'use client';
import { Markdown } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { fromNow } from '@orvilo/utils/time';
import { cn } from 'cn';
import { ExternalLink, Link2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ui/code-block';

import {
  buildGitHubRenderModel,
  formatIsoDate,
  type GitHubEntity,
  type GitHubField,
  type GitHubLink,
} from './utils';

const styles = {
  container: 'min-w-0 overflow-hidden text-sm leading-5.5',
  description: 'max-h-45 overflow-auto rounded-(--radius-card) bg-muted p-4',
  entityHeader: 'flex min-w-0 items-center justify-between gap-3',
  headLeft: 'flex min-w-0 items-center gap-1.5',
  linkRow:
    'flex h-8 min-w-0 items-center gap-2 overflow-hidden rounded-(--radius-button) px-2 text-sm leading-5.5 text-foreground hover:bg-accent hover:text-primary-text focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
  linkText: 'min-w-0 overflow-hidden',
  metaItem: 'inline-flex min-w-0 items-baseline gap-1 text-xs leading-5',
  metaLabel: 'shrink-0 text-muted-foreground',
  metaRow: 'flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1',
  metaValue: 'min-w-0 truncate text-muted-foreground',
  rawDetails:
    'text-xs leading-5 text-muted-foreground [&_summary]:mbe-1.5 [&_summary]:min-h-8 [&_summary]:py-1.5 [&_summary]:rounded-(--radius-button) [&_summary]:w-fit [&_summary]:cursor-pointer [&_summary]:focus-visible:outline-none [&_summary]:focus-visible:ring-3 [&_summary]:focus-visible:ring-ring/50',
  sectionLabel: 'text-xs leading-5 text-muted-foreground',
  timeItem: 'shrink-0 whitespace-nowrap text-xs leading-5 text-muted-foreground',
  titleLink:
    'inline-flex min-h-8 min-w-0 items-center gap-1 rounded-(--radius-button) text-inherit hover:text-primary-text focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
};

const hasItems = <T,>(items: T[]) => items.length > 0;

const Section = memo<{ children: ReactNode; title: string }>(({ children, title }) => (
  <div className="flex flex-col gap-1.5">
    <div className={styles.sectionLabel}>{title}</div>
    {children}
  </div>
));
Section.displayName = 'GitHubRenderSection';

const MetaRow = memo<{ fields: GitHubField[] }>(({ fields }) => {
  if (!hasItems(fields)) return null;

  return (
    <div className={styles.metaRow}>
      {fields.map((field) => (
        <span className={styles.metaItem} key={`${field.key}:${field.value}`}>
          <span className={styles.metaLabel}>{field.label}</span>
          <span className={styles.metaValue} title={field.value}>
            {field.value}
          </span>
        </span>
      ))}
    </div>
  );
});
MetaRow.displayName = 'GitHubRenderMetaRow';

const LinkList = memo<{ links: GitHubLink[] }>(({ links }) => {
  if (!hasItems(links)) return null;

  return (
    <div className="flex flex-col gap-1">
      {links.map((link) => (
        <a
          className={styles.linkRow}
          href={link.url}
          key={`${link.title}:${link.url}`}
          rel={'noreferrer'}
          target={'_blank'}
        >
          <Link2 size={16} />
          <div className={`truncate ${styles.linkText}`} title={link.title}>
            {link.title}
          </div>
          <ExternalLink size={16} />
        </a>
      ))}
    </div>
  );
});
LinkList.displayName = 'GitHubRenderLinkList';

const EntityCard = memo<{ entity: GitHubEntity }>(({ entity }) => {
  const { t } = useTranslation('plugin');
  const { title, id, url, state, updatedAt, kind } = entity;

  return (
    <div className="flex w-full flex-col gap-2 rounded-(--radius-card) border border-divider p-4">
      <div className={styles.entityHeader}>
        <div className={styles.headLeft}>
          <Badge className="h-auto min-h-6 text-xs leading-5" size="sm">
            {kind}
          </Badge>
          {title &&
            (url ? (
              <a className={styles.titleLink} href={url} rel={'noreferrer'} target={'_blank'}>
                <div className="truncate text-base font-semibold">{title}</div>
                <ExternalLink size={16} />
              </a>
            ) : (
              <div className="truncate text-base font-semibold">{title}</div>
            ))}
          {id && (
            <Badge className="h-auto min-h-6 text-xs leading-5" size="sm">
              {id}
            </Badge>
          )}
          {state && (
            <Badge className="h-auto min-h-6 text-xs leading-5" size="sm" variant="outline">
              {state}
            </Badge>
          )}
        </div>
        {updatedAt && (
          <span className={styles.timeItem} title={formatIsoDate(updatedAt)}>
            {t('builtins.github.render.updatedAt', { time: fromNow(updatedAt) })}
          </span>
        )}
      </div>
      <MetaRow fields={entity.fields} />
      {entity.description && (
        <div className={styles.description}>
          <Markdown fontSize={14} variant={'chat'}>
            {entity.description}
          </Markdown>
        </div>
      )}
      <LinkList links={entity.links} />
    </div>
  );
});
EntityCard.displayName = 'GitHubRenderEntityCard';

const GitHubRender = memo<BuiltinRenderProps<Record<string, unknown>, unknown, unknown>>(
  ({ apiName, args, content, pluginError }) => {
    const { t } = useTranslation('plugin');
    const model = useMemo(
      () => buildGitHubRenderModel({ apiName, args, content, pluginError }),
      [apiName, args, content, pluginError],
    );
    const hasResult =
      hasItems(model.resultEntities) || Boolean(model.resultText) || Boolean(model.rawResultJson);

    if (!hasResult && !model.errorText) return null;

    return (
      <div className={cn('flex', 'flex-col', 'gap-3', styles.container)}>
        {hasItems(model.resultEntities) && (
          <div className="flex flex-col gap-2">
            {model.resultEntities.map((entity, index) => (
              <EntityCard
                entity={entity}
                key={`${entity.id || entity.title || 'entity'}:${index}`}
              />
            ))}
          </div>
        )}
        {model.resultText && (
          <CodeBlock
            wrap
            className="max-h-55 overflow-auto px-2"
            code={model.resultText}
            language={'text'}
            variant="ghost"
          >
            <CodeBlockCopyButton />
          </CodeBlock>
        )}
        {model.rawResultJson && (
          <details className={styles.rawDetails}>
            <summary>{t('builtins.github.render.rawResult')}</summary>
            <CodeBlock
              wrap
              className="max-h-65 overflow-auto px-2"
              code={model.rawResultJson}
              language={'json'}
              variant="ghost"
            />
          </details>
        )}
        {model.errorText && (
          <Section title={t('builtins.github.render.error')}>
            <CodeBlock
              wrap
              className="max-h-55 overflow-auto px-2"
              code={model.errorText}
              language={'text'}
              variant="ghost"
            >
              <CodeBlockCopyButton />
            </CodeBlock>
          </Section>
        )}
      </div>
    );
  },
);

GitHubRender.displayName = 'GitHubRender';

export default GitHubRender;
