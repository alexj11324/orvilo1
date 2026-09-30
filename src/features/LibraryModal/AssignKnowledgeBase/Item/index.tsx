import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { LockIcon } from 'lucide-react';
import { memo, type ReactNode } from 'react';

import KnowledgeIcon from '@/components/KnowledgeIcon';
import { type KnowledgeItem } from '@/types/knowledgeBase';

import Actions from './Action';

const styles = createStaticStyles(({ css, cssVar }) => ({
  desc: css`
    margin: 0 !important;
    font-size: 12px;
    line-height: 1;
    color: ${cssVar.colorTextDescription};
  `,
  link: css`
    overflow: hidden;
    color: ${cssVar.colorText};
  `,
  title: css`
    margin: 0 !important;
    font-size: 14px;
    line-height: 1;
  `,
}));

interface PluginItemProps extends KnowledgeItem {
  action?: ReactNode;
}

const PluginItem = memo<PluginItemProps>(
  ({ action, id, fileType, name, type, description, enabled, memberRestricted, visibility }) => {
    return (
      <div
        className="flex flex-row items-center gap-2 justify-between py-3 px-4"
        style={{ position: 'relative' }}
      >
        <div
          className="flex flex-row items-center flex-1 gap-2"
          style={{ overflow: 'hidden', position: 'relative' }}
        >
          <KnowledgeIcon
            fileType={fileType}
            locked={memberRestricted}
            name={name}
            size={{ file: 40, repo: 40 }}
            type={type}
          />
          <div
            className="flex flex-col flex-1 gap-1"
            style={{ overflow: 'hidden', position: 'relative' }}
          >
            <div className="flex flex-row items-center gap-1.5">
              {visibility === 'private' && (
                <span className="anticon" role="img">
                  <LockIcon
                    color={cssVar.colorTextDescription}
                    fill={'transparent'}
                    height={12}
                    size={12}
                    width={12}
                  />
                </span>
              )}
              <div className={cn('truncate min-w-0', styles.title)}>{name}</div>
            </div>
            {description && (
              <div className={cn('truncate min-w-0', styles.desc)}>{description}</div>
            )}
          </div>
        </div>
        {action === undefined ? <Actions enabled={enabled} id={id} type={type} /> : action}
      </div>
    );
  },
);

export default PluginItem;
