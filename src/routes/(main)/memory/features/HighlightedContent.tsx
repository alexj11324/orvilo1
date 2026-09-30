import { Markdown } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import { memo } from 'react';

interface HighlightedContentProps {
  children?: string | null;
  title?: string | null;
}

const HighlightedContent = memo<HighlightedContentProps>(({ title, children }) => {
  if (!children) return;
  const content = (
    <Markdown
      fontSize={14}
      variant={'chat'}
      style={{
        color: cssVar.colorText,
        overflow: 'visible',
      }}
    >
      {children || ''}
    </Markdown>
  );

  if (!title) return content;

  return (
    <div className="flex flex-col gap-2">
      <div className="font-medium">{title}</div>
      {content}
    </div>
  );
});

export default HighlightedContent;
