import { useHover } from 'ahooks';
import { createStaticStyles, cx } from 'antd-style';
import dayjs from 'dayjs';
import { Loader2 } from 'lucide-react';
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { memo, useMemo, useRef } from 'react';

import Avatar from '@/components/Avatar';
import GroupAvatar from '@/features/GroupAvatar';
import { useServerConfigStore } from '@/store/serverConfig';

interface ListItemProps extends Omit<ComponentProps<'div'>, 'title'> {
  actions?: ReactNode;
  active?: boolean;
  addon?: ReactNode;
  date?: number;
  description?: ReactNode;
  loading?: boolean;
  pin?: boolean;
  showAction?: boolean;
  styles?: {
    container?: CSSProperties;
    content?: CSSProperties;
    date?: CSSProperties;
    desc?: CSSProperties;
    pin?: CSSProperties;
    title?: CSSProperties;
  };
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
    desc: css`
      width: 100%;
      margin: 0;

      font-size: 12px;
      line-height: 1.2;
      color: ${cssVar.colorTextDescription};
    `,
    date: css`
      font-size: 12px;
      color: ${cssVar.colorTextPlaceholder};
    `,
    pin: css`
      position: absolute;
      inset-block-start: 6px;
      inset-inline-end: 6px;
    `,
    triangle: css`
      width: 10px;
      height: 10px;
      border-radius: 2px;

      opacity: 0.5;
      background: ${cssVar.colorPrimaryBorder};
      clip-path: polygon(0% 0%, 100% 0%, 100% 100%);
    `,
  };
});

const getChatItemTime = (updateAt: number) => {
  const time = dayjs(updateAt);
  if (time.isSame(dayjs(), 'day')) return time.format('HH:mm');
  return time.format('MM-DD');
};

const ListItem = memo<
  Omit<ListItemProps, 'avatar' | 'key'> & {
    avatar: string | { avatar: string; background?: string }[];
    avatarBackground?: string;
    type?: 'agent' | 'group' | 'inbox';
  }
>(
  ({
    avatar,
    avatarBackground,
    active,
    showAction,
    actions,
    addon,
    children,
    date,
    description,
    loading,
    pin,
    styles: customStyles,
    style: propStyle,
    title,
    type,
    ...props
  }) => {
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
        <Avatar
          animation={isHovering}
          avatar={agentAvatar}
          background={avatarBackground}
          size={40}
        />
      );
    }, [isHovering, avatar, avatarBackground, type]);

    const showActions = isHovering || showAction || mobile;

    return (
      <div
        ref={ref}
        style={{ ...customStyles?.container, ...propStyle }}
        className={cx(
          'relative flex items-center gap-3',
          !mobile && active && 'bg-[var(--ant-color-fill-tertiary)]',
          styles.container,
          mobile && styles.mobile,
        )}
        {...(props as any)}
      >
        {pin && (
          <div className={styles.pin} style={customStyles?.pin}>
            <div className={styles.triangle} />
          </div>
        )}
        {avatarRender}
        <div className="min-w-0 flex-1" style={{ overflow: 'hidden', ...customStyles?.content }}>
          <span className={styles.title} style={customStyles?.title}>
            {title}
          </span>
          {description && (
            <div className={styles.desc} style={customStyles?.desc}>
              {description}
            </div>
          )}
          {addon}
        </div>
        {loading ? (
          <Loader2 className="animate-spin" size={16} />
        ) : (
          <>
            {actions && showActions && <div className="flex items-center gap-1">{actions}</div>}
            {!!date && (
              <div
                className={styles.date}
                style={{ opacity: showActions ? 0 : undefined, ...customStyles?.date }}
              >
                {getChatItemTime(date)}
              </div>
            )}
          </>
        )}
        {children}
      </div>
    );
  },
);

ListItem.displayName = 'ListItem';

export default ListItem;
