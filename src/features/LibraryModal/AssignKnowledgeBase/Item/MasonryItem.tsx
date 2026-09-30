import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { LockIcon } from 'lucide-react';
import { memo, type ReactNode } from 'react';

import KnowledgeIcon from '@/components/KnowledgeIcon';
import { type KnowledgeItem } from '@/types/knowledgeBase';

import Actions from './Action';

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    cursor: pointer;

    position: relative;

    overflow: hidden;

    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};

    transition: all ${cssVar.motionDurationMid};

    &:hover {
      border-color: ${cssVar.colorPrimary};
      box-shadow: ${cssVar.boxShadowTertiary};
    }
  `,
  desc: css`
    margin: 0 !important;
    font-size: 12px;
    line-height: 1.4;
    color: ${cssVar.colorTextDescription};
  `,
  title: css`
    margin: 0 !important;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.4;
  `,
}));

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
                      color={cssVar.colorTextDescription}
                      fill={'transparent'}
                      height={12}
                      size={12}
                      width={12}
                    />
                  </span>
                )}
                <Text className={styles.title} ellipsis={{ rows: 2 }}>
                  {name}
                </Text>
              </div>
            </div>
          </div>
          {description && (
            <Text className={styles.desc} ellipsis={{ rows: 3 }}>
              {description}
            </Text>
          )}
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
