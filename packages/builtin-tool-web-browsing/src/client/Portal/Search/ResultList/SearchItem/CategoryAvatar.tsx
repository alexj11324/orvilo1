import {
  LucideAtom,
  LucideClapperboard,
  LucideFiles,
  LucideImages,
  LucideLaptop,
  LucideMusic,
  LucideNewspaper,
  LucideShoppingBag,
  LucideTextSearch,
  LucideUserRound,
} from 'lucide-react';
import { createElement, memo, useMemo } from 'react';

import Avatar from '@/components/Avatar';

interface CategoryAvatarProps {
  category: string;
  size?: number;
}

const CategoryAvatar = memo<CategoryAvatarProps>(({ category, size = 24 }) => {
  const categoryIcon = useMemo(() => {
    switch (category) {
      default:
      case 'general': {
        return LucideTextSearch;
      }
      case 'videos': {
        return LucideClapperboard;
      }
      case 'images': {
        return LucideImages;
      }
      case 'files': {
        return LucideFiles;
      }
      case 'music': {
        return LucideMusic;
      }
      case 'shopping': {
        return LucideShoppingBag;
      }
      case 'social': {
        return LucideUserRound;
      }
      case 'it': {
        return LucideLaptop;
      }
      case 'news': {
        return LucideNewspaper;
      }
      case 'science': {
        return LucideAtom;
      }
    }
  }, [category]);

  return (
    <Avatar
      background={'var(--accent)'}
      size={size}
      avatar={
        <span className="anticon" role="img" style={{ color: 'var(--muted-foreground)' }}>
          {createElement(categoryIcon, {
            size: '1em',
            width: '1em',
            height: '1em',
            fill: 'transparent',
          })}
        </span>
      }
    />
  );
});

export default CategoryAvatar;
