'use client';

import { type FC } from 'react';
import { memo } from 'react';

import { type ItemCardProps } from './ItemCard';

interface AboutListProps {
  grid?: boolean;
  ItemRender: FC<ItemCardProps>;
  items: ItemCardProps[];
}

const AboutList = memo<AboutListProps>(({ grid, items, ItemRender }) => {
  // A white-label deployment may leave a branding URL undefined, which means
  // "no such account" — drop the entry instead of rendering a dead link.
  const visibleItems = items.filter((item) => Boolean(item.href));
  const content = visibleItems.map((item) => <ItemRender key={item.value} {...item} />);

  // Link rows (Contact / Legal) read as one line of links rather than a stacked
  // list; wrap keeps them intact on narrow viewports.
  if (!grid)
    return (
      <div
        className={'flex min-w-0'}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}
      >
        {content}
      </div>
    );

  return (
    <div
      className="grid w-full"
      style={{ gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
    >
      {content}
    </div>
  );
});

export default AboutList;
