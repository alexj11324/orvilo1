import { memo } from 'react';

import { useCateColor } from './useCateColor';

interface CateTagProps {
  cate?: string | null;
}

const CateTag = memo<CateTagProps>(({ cate }) => {
  const cateColor = useCateColor(cate);
  return (
    <Badge
      size="lg"
      variant="primary-light"
      style={{
        background: cateColor?.backgroundColor,
        borderRadius: 16,
        color: cateColor?.color,
        flex: 'none',
        fontWeight: 500,
      }}
    >
      {cate?.toUpperCase() || 'CHORE'}
    </Badge>
  );
});

export default CateTag;
