'use client';

import { Fragment, memo } from 'react';

import Cell from '@/components/Cell';
import Divider from '@/components/Cell/Divider';

import { useCategory } from './useCategory';

const styles = {
  groupTitle:
    'pbs-4 pbe-1 px-4 text-xs font-medium leading-5 text-muted-foreground uppercase tracking-[calc(var(--spacing)*0.125)]',
};

const Category = memo(() => {
  const groups = useCategory();

  return (
    <>
      {groups.map((group, groupIndex) => (
        <Fragment key={group.key}>
          {groupIndex > 0 && <Divider />}
          <div className={styles.groupTitle}>{group.title}</div>
          {group.items.map(({ key, ...item }) => (
            <Cell key={key} {...item} />
          ))}
        </Fragment>
      ))}
    </>
  );
});

export default Category;
