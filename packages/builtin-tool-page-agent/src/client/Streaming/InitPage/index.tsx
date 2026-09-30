'use client';

import { Text } from '@lobehub/ui/base-ui';
import type { InitDocumentArgs } from '@orvilo/editor-runtime';
import type { BuiltinStreamingProps } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { FileText, Hash, ListTree } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import StreamingMarkdown from '@/components/StreamingMarkdown';

import { AnimatedNumber } from '../../components/AnimatedNumber';

const MAX_PREVIEW_CHARS = 4000;

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    overflow: hidden;

    width: 100%;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    background: ${cssVar.colorBgContainer};
  `,
  header: css`
    padding-block: 10px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  icon: css`
    color: ${cssVar.colorPrimary};
  `,
  meta: css`
    color: ${cssVar.colorTextDescription};
  `,
  preview: css`
    overflow: auto;
    max-height: 360px;
    padding-block: 8px;
    padding-inline: 12px;
  `,
  title: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;

    font-weight: 500;
    color: ${cssVar.colorText};
  `,
}));

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
            <Text as={'span'} color={cssVar.colorTextDescription} fontSize={12}>
              <ListTree size={12} /> <AnimatedNumber value={lines} />
              {t('builtins.orvilo-page-agent.apiName.initPage.lines')}
            </Text>
            <Text as={'span'} color={cssVar.colorTextDescription} fontSize={12}>
              <Hash size={12} /> <AnimatedNumber value={chars} />
              {t('builtins.orvilo-page-agent.apiName.initPage.chars')}
            </Text>
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
