import { cn } from 'cn';
import { memo } from 'react';

import {
  CodeBlock,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLanguage,
} from '@/components/reui/code-block/code-block';

import { containerStyles } from '../style';

const Preview = memo<{ content: string }>(({ content }) => {
  return (
    <div className={cn(containerStyles.preview, containerStyles.previewWide, 'p-4')}>
      <CodeBlock
        wrap
        className="[--code-block-font-size:--spacing(3.5)] [--code-block-line-height:--spacing(5.5)] [--code-block-radius:var(--radius-card)]"
        code={content}
        language="json"
        variant="ghost"
      >
        <CodeBlockHeader className="justify-between border-0">
          <CodeBlockLanguage className="rounded-(--radius-chip) text-xs leading-5" />
          <CodeBlockCopyButton className="[&_svg]:size-4" size="icon" />
        </CodeBlockHeader>
      </CodeBlock>
    </div>
  );
});

export default Preview;
