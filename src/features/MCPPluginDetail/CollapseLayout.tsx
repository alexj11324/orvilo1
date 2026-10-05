import { type ReactNode } from 'react';
import { memo } from 'react';

import Title, { type TitleProps } from './Title';

export type CollapseItemType = {
  children: ReactNode;
  key: string;
  title: ReactNode;
  titleProps?: TitleProps;
};

export interface CollapseLayoutProps {
  items: CollapseItemType[];
}

const CollapseLayout = memo<CollapseLayoutProps>(({ items }) => {
  return (
    <div className="flex flex-col gap-6">
      {items.map((item) => (
        <div className="flex flex-col gap-3" key={item.key}>
          {item.title && (
            <Title level={3} {...item.titleProps}>
              {item.title}
            </Title>
          )}
          {item.children}
        </div>
      ))}
    </div>
  );
});

export default CollapseLayout;
