import { cn } from 'cn';
import { LockIcon } from 'lucide-react';
import { memo, type ReactNode } from 'react';

import KnowledgeIcon from '@/components/KnowledgeIcon';
import { type KnowledgeItem } from '@/types/knowledgeBase';

import Actions from './Action';

const styles = {
  card: 'cursor-pointer relative overflow-hidden p-4 border border-divider rounded-(--radius-card) bg-card transition-[border-color,box-shadow] duration-(--orvilo-motion-mid) ease-[ease] hover:border-primary hover:shadow-(--shadow-raised)',
  desc: 'm-0 text-xs leading-5 text-foreground-description',
  title: 'm-0 text-sm leading-5.5 font-medium',
};

interface MasonryItemProps extends KnowledgeItem {
  action?: ReactNode;
}

const MasonryItem = memo<MasonryItemProps>(
  ({ action, id, fileType, name, type, description, enabled, memberRestricted, visibility }) => {
    return (
      <div className={styles.card}>
        <div className="flex flex-col gap-3" style={{ position: 'relative' }}>
          <div className="flex flex-row items-center gap-3">
            <KnowledgeIcon
              fileType={fileType}
              locked={memberRestricted}
              name={name}
              size={{ file: 48, repo: 48 }}
              type={type}
            />
            <div
              className="flex flex-col flex-1 gap-1.5"
              style={{ overflow: 'hidden', position: 'relative' }}
            >
              <div className="flex flex-row items-center gap-1.5">
                {visibility === 'private' && (
                  <span className="anticon" role="img">
                    <LockIcon
                      className="size-4 text-foreground-description"
                      fill={'transparent'}
                      height={16}
                      size={16}
                      width={16}
                    />
                  </span>
                )}
                <div className={cn('line-clamp-2', styles.title)}>{name}</div>
              </div>
            </div>
          </div>
          {description && <div className={cn('line-clamp-3', styles.desc)}>{description}</div>}
          <div className="flex flex-col items-center justify-end">
            {action === undefined ? <Actions enabled={enabled} id={id} type={type} /> : action}
          </div>
        </div>
      </div>
    );
  },
);

MasonryItem.displayName = 'MasonryItem';

export default MasonryItem;
