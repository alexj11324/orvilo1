'use client';
import { Markdown } from '@lobehub/ui';
import { type BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';

import { CodeBlock } from '@/components/reui/code-block/code-block';

import type { ReadReferenceParams, ReadReferenceState } from '../../../types';

const styles = { container: 'overflow-hidden ps-2 pe-0' };

const getFileExtension = (path: string): string => {
  const parts = path.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() || 'text' : 'text';
};

const languageMap: Record<string, string> = {
  css: 'css',
  go: 'go',
  html: 'html',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsx: 'jsx',
  md: 'markdown',
  py: 'python',
  rs: 'rust',
  scss: 'scss',
  sh: 'bash',
  sql: 'sql',
  ts: 'typescript',
  tsx: 'tsx',
  xml: 'xml',
  xsd: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
};

const getLanguage = (ext: string): string => languageMap[ext] || 'text';

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ReadReference = memo<BuiltinRenderProps<ReadReferenceParams, ReadReferenceState>>(
  ({ content, pluginState }) => {
    const { encoding, fullPath, path, size } = pluginState || {};

    if (!path || !content) return null;

    const displayPath = fullPath || path;

    const ext = getFileExtension(path);
    const isMarkdown = ext === 'md' || ext === 'markdown';
    const isBinary = encoding === 'base64';

    const sizeText = size ? formatSize(size) : '';

    return (
      <div className={cn('flex flex-col gap-2', styles.container)}>
        <div className="flex flex-row items-center justify-between">
          <span className="font-mono rounded bg-muted px-1 truncate text-[12px]">
            {displayPath}
          </span>
          {sizeText && (
            <span className="font-mono rounded bg-muted px-1 whitespace-nowrap text-[12px] text-muted-foreground">
              {sizeText}
            </span>
          )}
        </div>

        {isBinary ? (
          <div className="rounded-md border bg-card" style={{ padding: 12 }}>
            <div className="text-[12px] text-muted-foreground">Binary file ({sizeText})</div>
          </div>
        ) : isMarkdown ? (
          <div className="rounded-md border bg-card" style={{ padding: 12 }}>
            <Markdown style={{ overflow: 'unset' }} variant={'chat'}>
              {content}
            </Markdown>
          </div>
        ) : (
          <div className="rounded-md border bg-card" style={{ padding: 8 }}>
            <CodeBlock
              wrap
              code={content}
              language={getLanguage(ext)}
              style={{ maxHeight: 400, overflow: 'auto' }}
              variant={'ghost'}
            />
          </div>
        )}
      </div>
    );
  },
);

ReadReference.displayName = 'ReadReference';

export default ReadReference;
