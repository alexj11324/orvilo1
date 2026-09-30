import { cssVar } from 'antd-style';
import { HashIcon } from 'lucide-react';
import { memo } from 'react';

import { Badge } from '@/components/reui/badge';

interface HashTagsProps {
  hashTags?: string[] | null;
}

const HashTags = memo<HashTagsProps>(({ hashTags }) => {
  if (!hashTags || hashTags.length === 0) return;
  return (
    hashTags &&
    hashTags.length > 0 && (
      <div className="flex flex-wrap">
        {hashTags.map((tag, index) => (
          <Badge
            key={index}
            variant="secondary"
            style={{
              color: cssVar.colorTextDescription,
              gap: 2,
              marginRight: 12,
              paddingInline: 0,
            }}
          >
            <HashIcon />
            {tag}
          </Badge>
        ))}
      </div>
    )
  );
});

export default HashTags;
