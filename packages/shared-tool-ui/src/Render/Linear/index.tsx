'use client';
import { Markdown } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { fromNow } from '@orvilo/utils/time';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { ExternalLink, Inbox, Link2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ui/code-block';

import {
  buildLinearRenderModel,
  formatIsoDate,
  isUuidLike,
  type LinearEntity,
  type LinearField,
  type LinearLink,
} from './utils';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    overflow: hidden;
    min-width: 0;
  `,
  description: css`
    overflow: auto;

    max-height: 180px;
    padding-block: 8px;
    padding-inline: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 6px;

    background: ${cssVar.colorFillQuaternary};
  `,
  empty: css`
    display: flex;
    gap: 6px;
    align-items: center;
    justify-content: center;

    padding-block: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 6px;

    font-size: 13px;
    color: ${cssVar.colorTextTertiary};

    background: ${cssVar.colorFillQuaternary};
  `,
  entityHeader: css`
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    min-width: 0;
  `,
  headLeft: css`
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
  `,
  timeItem: css`
    flex-shrink: 0;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    white-space: nowrap;
  `,
  metaItem: css`
    display: inline-flex;
    gap: 4px;
    align-items: baseline;

    min-width: 0;

    font-size: 12px;
    line-height: 1.5;
  `,
  metaLabel: css`
    flex-shrink: 0;
    color: ${cssVar.colorTextTertiary};
  `,
  metaRow: css`
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    align-items: baseline;

    min-width: 0;
  `,
  metaValue: css`
    overflow: hidden;

    min-width: 0;

    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  linkRow: css`
    overflow: hidden;
    display: flex;
    gap: 8px;
    align-items: center;

    min-width: 0;
    padding-block: 6px;
    padding-inline: 8px;
    border-radius: 6px;

    color: ${cssVar.colorText};

    background: ${cssVar.colorFillQuaternary};

    &:hover {
      color: ${cssVar.colorLink};
      background: ${cssVar.colorFillTertiary};
    }
  `,
  linkText: css`
    overflow: hidden;
    min-width: 0;
  `,
  rawDetails: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    summary {
      cursor: pointer;
      width: fit-content;
      margin-block-end: 6px;
    }
  `,
  sectionLabel: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  titleLink: css`
    display: inline-flex;
    gap: 4px;
    align-items: center;

    min-width: 0;

    color: inherit;

    &:hover {
      color: ${cssVar.colorLink};
    }
  `,
}));

const hasItems = <T,>(items: T[]) => items.length > 0;

const Section = memo<{ children: ReactNode; title: string }>(({ children, title }) => (
  <div className="flex flex-col gap-[6px]">
    <div className={styles.sectionLabel}>{title}</div>
    {children}
  </div>
));
Section.displayName = 'LinearRenderSection';

const MetaRow = memo<{ fields: LinearField[] }>(({ fields }) => {
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
MetaRow.displayName = 'LinearRenderMetaRow';

const LinkList = memo<{ links: LinearLink[] }>(({ links }) => {
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
          <Link2 size={13} />
          <div className={`truncate ${styles.linkText}`} title={link.title}>
            {link.title}
          </div>
          <ExternalLink size={12} />
        </a>
      ))}
    </div>
  );
});
LinkList.displayName = 'LinearRenderLinkList';

const EntityCard = memo<{ entity: LinearEntity }>(({ entity }) => {
  const { t } = useTranslation('plugin');
  const { title, id, url, state, updatedAt } = entity;

  // A bare UUID id only earns a slot when there's no title to carry the card
  // (e.g. comments / attachments, where it's also the link target). Human ids
  // like `LIN-123` always stay.
  const showId = Boolean(id) && (!title || !isUuidLike(id!));

  return (
    <div
      className="flex flex-col gap-2 p-[10px]"
      style={{
        background: cssVar.colorBgContainer,
        border: `1px solid ${cssVar.colorBorderSecondary}`,
        borderRadius: cssVar.borderRadius,
        width: '100%',
      }}
    >
      <div className={styles.entityHeader}>
        <div className={styles.headLeft}>
          {title &&
            (url ? (
              <a className={styles.titleLink} href={url} rel={'noreferrer'} target={'_blank'}>
                <div className="truncate font-semibold">{title}</div>
                <ExternalLink size={12} />
              </a>
            ) : (
              <div className="truncate font-semibold">{title}</div>
            ))}
          {showId &&
            (url && !title ? (
              <a className={styles.titleLink} href={url} rel={'noreferrer'} target={'_blank'}>
                <Badge size="sm">{id}</Badge>
                <ExternalLink size={12} />
              </a>
            ) : (
              <Badge size="sm">{id}</Badge>
            ))}
          {state && (
            <Badge size="sm" variant="outline">
              {state}
            </Badge>
          )}
        </div>
        {updatedAt && (
          <span className={styles.timeItem} title={formatIsoDate(updatedAt)}>
            {t('builtins.linear.render.updatedAt', { time: fromNow(updatedAt) })}
          </span>
        )}
      </div>
      <MetaRow fields={entity.fields} />
      {entity.description && (
        <div className={styles.description}>
          <Markdown fontSize={13} variant={'chat'}>
            {entity.description}
          </Markdown>
        </div>
      )}
      <LinkList links={entity.links} />
    </div>
  );
});
EntityCard.displayName = 'LinearRenderEntityCard';

const LinearRender = memo<BuiltinRenderProps<Record<string, unknown>, unknown, unknown>>(
  ({ apiName, args, content, pluginError }) => {
    const { t } = useTranslation('plugin');
    const model = useMemo(
      () => buildLinearRenderModel({ apiName, args, content, pluginError }),
      [apiName, args, content, pluginError],
    );
    const hasResult =
      hasItems(model.resultEntities) ||
      Boolean(model.resultText) ||
      Boolean(model.rawResultJson) ||
      Boolean(model.emptyCollectionKey);

    // Request args are intentionally not rendered here — the Inspector already
    // surfaces the tool inputs, so duplicating them in the render is redundant.
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
        {model.emptyCollectionKey && (
          <div className={styles.empty}>
            <Inbox size={14} />
            <span>
              {t('builtins.linear.render.empty', { collection: model.emptyCollectionKey })}
            </span>
          </div>
        )}
        {model.resultText && (
          <CodeBlock
            wrap
            code={model.resultText}
            language={'text'}
            style={{ maxHeight: 220, overflow: 'auto', paddingInline: 8 }}
            variant="ghost"
          >
            <CodeBlockCopyButton />
          </CodeBlock>
        )}
        {model.rawResultJson && (
          <details className={styles.rawDetails}>
            <summary>Raw result</summary>
            <CodeBlock
              wrap
              code={model.rawResultJson}
              language={'json'}
              style={{ maxHeight: 260, overflow: 'auto', paddingInline: 8 }}
              variant="ghost"
            />
          </details>
        )}
        {model.errorText && (
          <Section title={'Error'}>
            <CodeBlock
              wrap
              code={model.errorText}
              language={'text'}
              style={{ maxHeight: 220, overflow: 'auto', paddingInline: 8 }}
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

LinearRender.displayName = 'LinearRender';

export default LinearRender;
