import { createStaticStyles, cx } from 'antd-style';
import {
  createElement,
  type CSSProperties,
  type ElementType,
  isValidElement,
  memo,
  type ReactNode,
  type SyntheticEvent,
} from 'react';

import { type ActionMenuItem, type MenuInfo } from '@/components/ItemsMenu';
import { Separator } from '@/components/ui/separator';

export type ItemType = ActionMenuItem;
export type MenuItemType = ActionMenuItem;

export type { MenuInfo };

const styles = createStaticStyles(({ css }) => ({
  compact: css`
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  `,
  item: css`
    cursor: pointer;

    display: flex;
    gap: 0.75rem;
    align-items: center;

    height: unset;
    min-height: 2rem;
    padding-block: 0.375rem;
    padding-inline: 0.75rem;
    border-radius: 8px;

    line-height: 2;

    &:hover {
      background: var(--ant-color-fill-tertiary);
    }
  `,
  groupLabel: css`
    padding-block: 0.375rem;
    padding-inline: 0.75rem;
    font-size: 12px;
    color: var(--ant-color-text-tertiary);
  `,
  icon: css`
    display: inline-flex;
    color: var(--ant-color-text-secondary);

    svg {
      width: 16px;
      height: 16px;
    }
  `,
  label: css`
    flex: 1;
    min-width: 0;
  `,
  menu: css`
    display: flex;
    flex: 1;
    flex-direction: column;
    background: transparent;
  `,
  selected: css`
    background: var(--ant-color-fill-secondary);

    &:hover {
      background: var(--ant-color-fill-secondary);
    }
  `,
}));

export interface MenuProps {
  className?: string;
  compact?: boolean;
  items?: ItemType[];
  onClick?: (info: MenuInfo) => void;
  selectable?: boolean;
  selectedKeys?: string[];
  style?: CSSProperties;
}

const renderItems = (
  items: ItemType[],
  props: {
    compact?: boolean;
    onClick?: (info: MenuInfo) => void;
    selectable?: boolean;
    selectedKeys?: string[];
  },
  keyPath: string[] = [],
): ReactNode =>
  items.map((item, index) => {
    if (!item) return null;
    if (item.type === 'divider') return <Separator className="my-0.5" key={`divider-${index}`} />;
    if (item.type === 'group')
      return (
        <div key={item.key ?? `group-${index}`}>
          {item.label ? <div className={styles.groupLabel}>{item.label}</div> : null}
          {item.children ? renderItems(item.children, props, keyPath) : null}
        </div>
      );

    const key = item.key ?? `item-${index}`;
    const selected = props.selectable && props.selectedKeys?.includes(String(key));
    const clickable = !item.disabled;

    return (
      <div
        aria-disabled={item.disabled || undefined}
        key={key}
        role="menuitem"
        className={cx(
          styles.item,
          selected && styles.selected,
          item.danger && 'text-destructive-text',
          item.disabled && 'opacity-50 pointer-events-none',
          props.compact ? 'min-h-8 py-1' : undefined,
        )}
        onClick={(event: SyntheticEvent) => {
          if (!clickable) return;
          item.onClick?.({
            domEvent: event,
            item: event.currentTarget as EventTarget & Element,
            key: String(key),
            keyPath: [...keyPath, String(key)],
          });
          props.onClick?.({
            domEvent: event,
            item: event.currentTarget as EventTarget & Element,
            key: String(key),
            keyPath: [...keyPath, String(key)],
          });
        }}
      >
        {item.icon ? (
          <span className={styles.icon}>
            {isValidElement(item.icon) ? item.icon : createElement(item.icon as ElementType)}
          </span>
        ) : null}
        <span className={cx(styles.label, item.className)}>{item.label}</span>
        {item.extra}
      </div>
    );
  });

const Menu = memo<MenuProps>(
  ({ className, selectable = false, compact, items, onClick, selectedKeys, style }) => {
    return (
      <div
        className={cx(styles.menu, compact && styles.compact, className)}
        role="menu"
        style={style}
      >
        {renderItems(items ?? [], { compact, onClick, selectable, selectedKeys })}
      </div>
    );
  },
);

export default Menu;
