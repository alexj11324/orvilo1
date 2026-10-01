import { cx } from 'antd-style';
import { memo } from 'react';

import { CodeBlock } from '@/components/reui/code-block/code-block';

import { containerStyles } from '../style';

const Preview = memo<{ content: string }>(({ content }) => {
  return (
    <div
      className={cx(containerStyles.preview, containerStyles.previewWide)}
      style={{ padding: 16 }}
    >
      <CodeBlock wrap code={content} language="json" style={{ fontSize: 12 }} variant="ghost" />
    </div>
  );
});

export default Preview;
