import { Markdown } from '@lobehub/ui';
import type { WriteLocalFileParams } from '@orvilo/electron-client-ipc';
import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { ChevronRight } from 'lucide-react';
import path from 'path-browserify-esm';
import { memo } from 'react';

import { InlineHtmlPreview, isHtmlFile } from '@/components/HtmlPreview';
import { CodeBlock } from '@/components/ui/code-block';
import { Skeleton } from '@/components/ui/skeleton';
import { LocalFile, LocalFolder } from '@/features/LocalFile';

const styles = {
  container: 'py-1',
  previewBox: 'overflow-hidden rounded-[8px] bg-accent',
};

type WriteFileArgs = WriteLocalFileParams & {
  file_path?: string;
  filePath?: string;
};

const WriteFile = memo<BuiltinRenderProps<WriteFileArgs>>(({ args }) => {
  if (!args)
    return (
      <div className="flex flex-col gap-2">
        <Skeleton />
        <Skeleton />
        <Skeleton />
        <Skeleton style={{ width: '60%' }} />
      </div>
    );

  const filePath = args.path || args.filePath || args.file_path || '';
  const { base, dir } = path.parse(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const isHtml = isHtmlFile({ path: filePath });
  const isMarkdown = ext === 'md' || ext === 'mdx';

  // Code-type files render as a "new file" diff so the visual is
  // consistent with EditLocalFile. Markdown keeps its rendered
  // preview because a rendered doc reads better than an all-green diff.
  if (!isMarkdown && !isHtml && args.content) {
    const code = args.content.replace(/\n$/, '');
    return (
      <CodeBlock
        showLineNumbers
        code={code}
        diff={{ added: `1-${code.split('\n').length}` }}
        language={ext || undefined}
        variant="ghost"
      />
    );
  }

  return (
    <div className={cn('flex flex-col gap-3', styles.container)}>
      <div className="flex flex-row items-center">
        <LocalFolder path={dir} />
        <span className="anticon" role="img">
          <ChevronRight fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
        </span>
        <LocalFile name={base} path={filePath} />
      </div>

      {args.content && (
        <div
          className={cn('flex flex-col', styles.previewBox)}
          style={{ height: isHtml ? 260 : undefined }}
        >
          {isHtml ? (
            <InlineHtmlPreview content={args.content} />
          ) : (
            <Markdown
              style={{ maxHeight: 240, overflow: 'auto', padding: '0 8px' }}
              variant={'chat'}
            >
              {args.content}
            </Markdown>
          )}
        </div>
      )}
    </div>
  );
});

export default WriteFile;
