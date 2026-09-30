import { Avatar } from '@lobehub/ui/base-ui';
import { useHover } from 'ahooks';
import { createStaticStyles, cx } from 'antd-style';
import type { ComponentProps, ReactNode } from 'react';
import { memo, useMemo, useRef } from 'react';

import GroupAvatar from '@/features/GroupAvatar';
import { useServerConfigStore } from '@/store/serverConfig';

interface ListItemProps extends ComponentProps<'div'> {
  actions?: ReactNode;
  active?: boolean;
  showAction?: boolean;
  title?: ReactNode;
}

const styles = createStaticStyles(({ css, cssVar }) => {
  return {
    container: css`
      position: relative;
      margin-block: 2px;
      padding-inline: 12px 16px;
      border-radius: ${cssVar.borderRadius};
    `,
    mobile: css`
      margin-block: 0;
      padding-inline-start: 12px;
      border-radius: 0;
    `,
    title: css`
      line-height: 1.2;
    `,
  };
});

const ListItem = memo<
  Omit<ListItemProps, 'avatar' | 'key'> & {
    avatar: string | { avatar: string; background?: string }[];
    avatarBackground?: string;
    type?: 'agent' | 'group' | 'inbox';
  }
>(({ avatar, avatarBackground, active, showAction, actions, title, type, ...props }) => {
  const ref = useRef(null);
  const isHovering = useHover(ref);
  const mobile = useServerConfigStore((s) => s.isMobile);

  const avatarRender = useMemo(() => {
    if (type === 'group') {
      const avatars = Array.isArray(avatar) ? avatar : [avatar];
      return <GroupAvatar avatars={avatars} size={40} />;
    }

    // For regular sessions, use the regular Avatar component
    const agentAvatar = typeof avatar === 'string' ? avatar : avatar[0]?.avatar;

    return (
      <Avatar animation={isHovering} avatar={agentAvatar} background={avatarBackground} size={40} />
    );
  }, [isHovering, avatar, avatarBackground, type]);

  return (
    <div
      ref={ref}
      className={cx(
        'relative flex items-center gap-3',
        !mobile && active && 'bg-[var(--ant-color-fill-tertiary)]',
        styles.container,
        mobile && styles.mobile,
      )}
      {...(props as any)}
    >
      {avatarRender}
      <div className="min-w-0 flex-1">
        <span className={styles.title}>{title}</span>
      </div>
      {actions && (isHovering || showAction || mobile) && (
        <div className="flex items-center gap-1">{actions}</div>
      )}
    </div>
  );
});

export default ListItem;
