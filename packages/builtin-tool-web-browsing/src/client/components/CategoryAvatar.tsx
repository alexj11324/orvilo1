import { memo } from 'react';

import Avatar from '@/components/Avatar';

import { CATEGORY_ICON_MAP } from '../../const';

interface CategoryAvatarProps {
  category: string;
}

export const CategoryAvatar = memo<CategoryAvatarProps>(({ category }) => {
  const IconComponent = CATEGORY_ICON_MAP[category];

  return (
    <Avatar
      alt={category}
      avatar={<IconComponent />}
      style={{
        backgroundColor: 'transparent',
        color: 'var(--muted-foreground)',
        height: 16,
        width: 16,
      }}
    />
  );
});
