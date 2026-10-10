'use client';

import { cn } from 'cn';
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

const styles = {
  card: 'scroll-mt-4 overflow-hidden border-b border-divider bg-card',
  cardBody: 'gap-0',
  cardHeader: 'gap-1.5 p-3 border-b border-divider bg-fill-quaternary',
  code: 'overflow-auto max-h-80 m-0 p-3 font-mono text-xs leading-5 text-muted-foreground bg-fill-quaternary',
  fixture: 'p-3',
  fixtureSummary:
    'cursor-pointer select-none min-h-8 text-sm leading-5.5 text-foreground-tertiary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
  previewShell: 'p-3 bg-fill-quaternary',
  previewSection: 'gap-2 p-3 border-b border-divider',
  sectionLabel: 'gap-2 items-center',
};

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
    <div className={cn(styles.card, 'flex flex-col')} id={toApiAnchor(api.apiName)}>
      <div className={cn(styles.cardHeader, 'flex flex-col')}>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xl leading-7 font-semibold">{api.apiName}</div>
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
          <div className="text-sm leading-5.5 text-muted-foreground">
            {activeVariant.description ?? api.description}
          </div>
        )}
      </div>

      <div className={cn(styles.cardBody, 'flex flex-col')}>
        <div className={cn(styles.previewSection, 'flex flex-col')}>
          <div className={cn(styles.sectionLabel, 'flex')}>
            <div className="text-xs leading-5 text-muted-foreground font-semibold">Inspector</div>
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

        <div className={cn(styles.previewSection, 'flex flex-col')}>
          <div className={cn(styles.sectionLabel, 'flex')}>
            <div className="text-xs leading-5 text-muted-foreground font-semibold">Body</div>
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
