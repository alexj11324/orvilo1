'use client';

import { createStaticStyles } from 'antd-style';
import { memo } from 'react';

import { Badge } from '@/components/reui/badge';

const styles = createStaticStyles(({ css, cssVar }) => {
  return {
    tag: css`
      margin: 0;
      padding-block: 4px;
      padding-inline: 12px;
      border-radius: 16px;

      color: ${cssVar.colorTextSecondary};
    `,
  };
});

const VersionTag = memo<{ range: string[] }>(({ range }) => {
  return (
    <Badge className={styles.tag} variant="secondary">
      {range.map((v) => 'v' + v).join(' ~ ')}
    </Badge>
  );
});

export default VersionTag;
