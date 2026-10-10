'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { XIcon } from 'lucide-react';
import { type HTMLAttributes, memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { useIsDark } from '@/hooks/useIsDark';

const styles = createStaticStyles(({ css }) => ({
  wrapper: css`
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, ${cssVar.colorBgContainer} 0%, transparent),
        ${cssVar.colorBgContainer} var(--gradient-stop, 140px)
      ),
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24'%3E%3Cg fill='${cssVar.colorFillTertiary}' %3E %3Cpolygon fill-rule='evenodd' points='8 4 12 6 8 8 6 12 4 8 0 6 4 4 6 0 8 4'/%3E%3C/g%3E%3C/svg%3E");
  `,
  wrapperDark: css`
    --gradient-stop: 80px;
  `,
  wrapperLight: css`
    --gradient-stop: 140px;
  `,
}));

interface NotificationProps extends HTMLAttributes<HTMLDivElement> {
  height?: number | string;
  mobile?: boolean;
  onCancel?: (show?: boolean) => void;
  show: boolean;
  showCloseIcon?: boolean;
  width?: number | string;
  wrapper?: HTMLAttributes<HTMLDivElement>;
}

const Notification = memo<NotificationProps>(
  ({
    mobile,
    children,
    show,
    onCancel,
    showCloseIcon = true,
    width = 422,
    height = 'auto',
    wrapper = {},
    className,
    ...rest
  }) => {
    const { t: tCommon } = useTranslation('common');
    const isDarkMode = useIsDark();
    const { className: wrapperClassName, ...restWrapper } = wrapper;
    return (
      show && (
        <div
          style={{ height, width: mobile ? 'calc(100% - 16px)' : width }}
          className={cn(
            'absolute z-[1100] end-5 inset-be-4 flex flex-col overflow-hidden rounded-(--radius-overlay) border border-divider bg-card text-sm leading-5.5 text-foreground shadow-(--shadow-popover)',
            mobile && 'start-2 inset-be-2',
            className,
          )}
          {...rest}
        >
          {showCloseIcon && (
            <ActionIcon
              aria-label={tCommon('close')}
              className="absolute z-100 inset-bs-2 end-2"
              icon={XIcon}
              size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 20 }}
              onClick={() => onCancel?.()}
            />
          )}
          <div
            className={cn(
              'flex gap-4 px-5 pt-5 pb-4',
              cx(
                styles.wrapper,
                isDarkMode ? styles.wrapperDark : styles.wrapperLight,
                wrapperClassName,
              ),
            )}
            {...restWrapper}
          >
            {children}
          </div>
        </div>
      )
    );
  },
);

export default Notification;
