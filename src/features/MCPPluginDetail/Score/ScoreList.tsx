import { Divider } from 'antd';
import { Fragment, memo } from 'react';

import { type ScoreItemProps } from './ScoreItem';
import ScoreItem from './ScoreItem';

interface ScoreListProps {
  items: ScoreItemProps[];
}

const ScoreList = memo<ScoreListProps>(({ items }) => {
  return (
    <div className="flex flex-col gap-4 py-4">
      {items.map((item, index) => (
        <Fragment key={item.key}>
          <ScoreItem {...item} key={item.key} />
          {index < items.length - 1 && <Divider style={{ margin: 0 }} />}
        </Fragment>
      ))}
    </div>
  );
});

export default ScoreList;
