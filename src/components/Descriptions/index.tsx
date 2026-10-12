import { clsx as cx, cn } from 'cn';
import { type LucideIcon } from 'lucide-react';
import {
  createElement,
  type CSSProperties,
  type HTMLAttributes,
  memo,
  type ReactNode,
} from 'react';

import CopyableLabel from '../CopyableLabel';

const styles = {
  bordered:
    'overflow-hidden rounded-(--radius-card) border border-divider [@media(width<=575.98px)]:bg-card',
  cell: 'overflow-hidden [box-shadow:0_0_0_0.5px_var(--divider)]',
  label: 'overflow-hidden border-e border-divider bg-fill-quaternary',
};

export interface DescriptionItem {
  className?: string;
  classNames?: {
    label?: string;
    value?: string;
  };
  copyable?: boolean;
  icon?: LucideIcon | ReactNode;
  key: string;
  label: ReactNode;
  style?: CSSProperties;
  styles?: {
    label?: CSSProperties;
    value?: CSSProperties;
  };
  value: ReactNode;
}

interface DescriptionsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  bordered?: boolean;
  classNames?: {
    item?: string;
    label?: string;
    value?: string;
  };
  colon?: boolean;
  column?: number;
  items: DescriptionItem[];
  labelStyle?: CSSProperties;
  labelWidth?: number | string;
  maxItemWidth?: number | string;
  rows?: number;
  size?: 'default' | 'middle' | 'small';
  styles?: {
    item?: CSSProperties;
    label?: CSSProperties;
    value?: CSSProperties;
  };
  wrap?: boolean;
}

const Descriptions = memo<DescriptionsProps>(
  ({
    labelWidth = 150,
    title,
    bordered,
    className,
    items,
    classNames,
    styles: customStyles,
    wrap,
    colon: _colon,
    labelStyle,
    maxItemWidth = 450,
    column,
    rows: _rows,
    size: _size,
    ...rest
  }) => {
    return (
      <>
        {title && <h3 className="mbs-3">{title}</h3>}
        <div
          className={cx(bordered && styles.bordered, className)}
          style={{
            display: 'grid',
            gridTemplateColumns: column
              ? `repeat(${column}, 1fr)`
              : `repeat(auto-fill, minmax(${typeof maxItemWidth === 'number' ? `${maxItemWidth}px` : (maxItemWidth ?? '450px')}, 1fr))`,
          }}
          {...rest}
        >
          {items.map((item) => (
            <div
              key={item.key}
              className={cn(
                'flex flex-1',
                wrap ? 'items-start' : 'items-center',
                cx(bordered && styles.cell, item.className, classNames?.item),
              )}
              style={{
                overflow: wrap ? undefined : 'hidden',
                position: 'relative',
                ...customStyles?.item,
                ...item.style,
              }}
            >
              <div
                className={cn('flex items-center', cx(bordered && styles.label))}
                style={{
                  flex: 'none',
                  gap: 6,
                  height: '100%',
                  paddingBlock: bordered ? 12 : 4,
                  paddingInline: bordered ? 16 : 0,
                  position: 'relative',
                  width: labelWidth,
                  ...labelStyle,
                }}
              >
                {item.icon &&
                  (typeof item.icon === 'function'
                    ? createElement(item.icon as LucideIcon, {
                        size: 16,
                        style: { color: 'var(--muted-foreground)' },
                      })
                    : item.icon)}
                <div
                  className={cn('truncate min-w-0', cx(classNames?.label, item.classNames?.label))}
                  style={{
                    color: 'var(--muted-foreground)',
                    ...customStyles?.label,
                    ...item.styles?.label,
                  }}
                >
                  {item.label}
                </div>
              </div>
              <div
                className={cn('flex flex-1 justify-start', wrap ? 'items-start' : 'items-center')}
                style={{
                  height: '100%',
                  overflow: wrap ? undefined : 'hidden',
                  paddingBlock: bordered ? 12 : 4,
                  paddingInline: 16,
                  position: 'relative',
                }}
              >
                {item.copyable ? (
                  <CopyableLabel
                    className={cx(classNames?.value, item.classNames?.value)}
                    style={{ ...customStyles?.value, ...item.styles?.value }}
                    value={item.value ? String(item.value) : '--'}
                    wrap={wrap}
                  />
                ) : (
                  <div
                    className={cn(
                      'truncate min-w-0',
                      cx(classNames?.value, item.classNames?.value),
                    )}
                    style={{
                      ...(wrap && {
                        overflowWrap: 'anywhere',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }),
                      ...customStyles?.value,
                      ...item.styles?.value,
                    }}
                  >
                    {item.value}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  },
);

export default Descriptions;
