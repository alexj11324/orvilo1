'use client';

import { createStaticStyles, cx } from 'antd-style';
import { useMemo, useState } from 'react';

import { Badge as Tag } from '@/components/reui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  bodyKindForMode,
  deriveFixtureProps,
  type LifecycleMode,
  type ToolRenderFixtureVariant,
} from './lifecycleMode';
import { ToolBodySlot, ToolInspectorSlot } from './toolSurfaces';
import type { ApiEntry } from './useDevtoolsEntries';
import { toApiAnchor } from './useDevtoolsEntries';

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    scroll-margin-block-start: 16px;
    overflow: hidden;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    background: ${cssVar.colorBgContainer};
  `,
  cardBody: css`
    gap: 0;
  `,
  cardHeader: css`
    gap: 6px;
    padding: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    background: ${cssVar.colorFillQuaternary};
  `,
  code: css`
    overflow: auto;

    max-height: 320px;
    margin: 0;
    padding: 12px;

    font-size: 12px;
    line-height: 1.55;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
  fixture: css`
    padding: 12px;
  `,
  fixtureSummary: css`
    cursor: pointer;
    user-select: none;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  previewShell: css`
    padding: 12px;
    background: ${cssVar.colorFillQuaternary};
  `,
  previewSection: css`
    gap: 8px;
    padding: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  sectionLabel: css`
    gap: 8px;
    align-items: center;
  `,
}));

interface ToolPreviewProps {
  api: ApiEntry;
  mode: LifecycleMode;
}

const ToolPreview = ({ api, mode }: ToolPreviewProps) => {
  const messageId = `devtools-${api.identifier}-${api.apiName}`;
  const toolCallId = `${messageId}-tool`;

  const variants = api.fixture.variants;
  const [activeVariantId, setActiveVariantId] = useState<string>(variants[0]?.id ?? 'default');
  const activeVariant: ToolRenderFixtureVariant =
    variants.find((variant) => variant.id === activeVariantId) ?? variants[0];

  const derived = useMemo(() => deriveFixtureProps(activeVariant, mode), [activeVariant, mode]);

  return (
    <div className={cx(styles.card, 'flex flex-col')} id={toApiAnchor(api.apiName)}>
      <div className={cx(styles.cardHeader, 'flex flex-col')}>
        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          <div className="text-[18px] font-semibold">{api.apiName}</div>
          <Tag>{api.identifier}</Tag>
          {variants.length > 1 && (
            <Tabs
              value={activeVariant.id}
              onValueChange={(key) => {
                if (typeof key === 'string') setActiveVariantId(key);
              }}
            >
              <TabsList>
                {variants.map((variant) => (
                  <TabsTrigger key={variant.id} value={variant.id}>
                    {variant.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </div>
        {(api.description || activeVariant.description) && (
          <div className="text-[13px] text-muted-foreground">
            {activeVariant.description ?? api.description}
          </div>
        )}
      </div>

      <div className={cx(styles.cardBody, 'flex flex-col')}>
        <div className={cx(styles.previewSection, 'flex flex-col')}>
          <div className={cx(styles.sectionLabel, 'flex')}>
            <div className="text-[12px] text-muted-foreground font-semibold">Inspector</div>
          </div>
          <div className={styles.previewShell}>
            <ToolInspectorSlot
              api={api}
              derived={derived}
              toolCallId={toolCallId}
              variant={activeVariant}
            />
          </div>
        </div>

        <div className={cx(styles.previewSection, 'flex flex-col')}>
          <div className={cx(styles.sectionLabel, 'flex')}>
            <div className="text-[12px] text-muted-foreground font-semibold">Body</div>
            <Tag>{bodyKindForMode(mode)}</Tag>
          </div>
          <div className={styles.previewShell}>
            <ToolBodySlot
              api={api}
              derived={derived}
              messageId={messageId}
              mode={mode}
              toolCallId={toolCallId}
            />
          </div>
        </div>

        <details className={styles.fixture}>
          <summary className={styles.fixtureSummary}>Fixture payload</summary>
          <pre className={styles.code}>
            {JSON.stringify(
              {
                args: derived.args,
                content: derived.content,
                isArgumentsStreaming: derived.isArgumentsStreaming,
                isLoading: derived.isLoading,
                partialArgs: derived.partialArgs,
                pluginError: derived.pluginError,
                pluginState: derived.pluginState,
              },
              null,
              2,
            )}
          </pre>
        </details>
      </div>
    </div>
  );
};

export default ToolPreview;
