'use client';

import { memo } from 'react';

import { Badge } from '@/components/reui/badge';

const VersionTag = memo<{ range: string[] }>(({ range }) => {
  return (
    <Badge className="m-0 h-auto px-3 py-1 leading-5 text-muted-foreground" variant="secondary">
      {range.map((v) => 'v' + v).join(' ~ ')}
    </Badge>
  );
});

export default VersionTag;
