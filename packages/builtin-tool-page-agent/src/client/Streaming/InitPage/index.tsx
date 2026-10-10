'use client';

import type { InitDocumentArgs } from '@orvilo/editor-runtime';
import type { BuiltinStreamingProps } from '@orvilo/types';
import { cn } from 'cn';
import { FileText, Hash, ListTree } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import StreamingMarkdown from '@/components/StreamingMarkdown';

import { AnimatedNumber } from '../../components/AnimatedNumber';

const MAX_PREVIEW_CHARS = 4000;

const styles = {
  container: 'w-full overflow-hidden rounded-[8px] border border-sidebar-border bg-card',
  header: 'px-3 py-2.5 [border-block-end:1px_solid_var(--sidebar-border)]',
  icon: 'text-primary',
  meta: 'text-[var(--ant-color-text-description)]',
  preview: 'max-h-[360px] overflow-auto px-3 py-2',
  title: 'line-clamp-1 font-medium text-foreground',
};

const extractTitle = (markdown: string) => {
  const titleLine = markdown
    .split(/\r?\n/)
    .find((line) => line.startsWith('# ') && line.slice(2).trim().length > 0);

  return titleLine?.slice(2).trim();
};

export const InitPageStreaming = memo<BuiltinStreamingProps<InitDocumentArgs>>(({ args }) => {
  const { t } = useTranslation('plugin');
  const markdown = args?.markdown || '';

  const { chars, lines, preview, title } = useMemo(() => {
    const preview =
      markdown.length > MAX_PREVIEW_CHARS
        ? `${markdown.slice(0, MAX_PREVIEW_CHARS)}\n\n...`
        : markdown;

    return {
      chars: markdown.length,
      lines: markdown ? markdown.split('\n').length : 0,
      preview,
      title: extractTitle(markdown),
    };
  }, [markdown]);

  if (!markdown) return null;

  return (
    <div className={cn('flex', 'flex-col', styles.container)}>
      <div className={cn('flex', 'items-center', 'gap-2', styles.header)}>
        <FileText className={styles.icon} size={16} />
        <div className="flex flex-col flex-1 gap-[2px]">
          <div className={styles.title}>
            {title || t('builtins.orvilo-page-agent.apiName.initPage.creating')}
          </div>
          <div className={cn('flex', 'items-center', 'gap-[10px]', styles.meta)}>
            <span className="text-[12px]" style={{ color: 'var(--ant-color-text-description)' }}>
              <ListTree size={12} /> <AnimatedNumber value={lines} />
              {t('builtins.orvilo-page-agent.apiName.initPage.lines')}
            </span>
            <span className="text-[12px]" style={{ color: 'var(--ant-color-text-description)' }}>
              <Hash size={12} /> <AnimatedNumber value={chars} />
              {t('builtins.orvilo-page-agent.apiName.initPage.chars')}
            </span>
          </div>
        </div>
      </div>
      <div className={styles.preview}>
        <StreamingMarkdown>{preview}</StreamingMarkdown>
      </div>
    </div>
  );
});

InitPageStreaming.displayName = 'PageAgentInitPageStreaming';

export default InitPageStreaming;
