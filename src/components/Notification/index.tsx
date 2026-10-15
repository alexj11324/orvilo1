'use client';

import { clsx as cx, cn } from 'cn';
import { XIcon } from 'lucide-react';
import { type CSSProperties, type HTMLAttributes, memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { useIsDark } from '@/hooks/useIsDark';
import { useResolvedFillTertiary } from '@/styles/themeRoles';

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
    const fillTertiary = useResolvedFillTertiary();
    const { className: wrapperClassName, style: wrapperStyle, ...restWrapper } = wrapper;
    const patternFill = fillTertiary
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;');
    const pattern = `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><g fill="${patternFill}"><polygon fill-rule="evenodd" points="8 4 12 6 8 8 6 12 4 8 0 6 4 4 6 0 8 4"/></g></svg>`,
    )}")`;
    return (
      show && (
        <div
          style={{ height, width: mobile ? 'calc(100% - 16px)' : width }}
          className={cx(
            'absolute z-1100 end-5 inset-be-4 flex flex-col overflow-hidden rounded-(--radius-overlay) border border-divider bg-card text-sm leading-5.5 text-foreground shadow-(--shadow-popover)',
            mobile && 'start-2 inset-be-2',
            className,
          )}
          {...rest}
        >
          {showCloseIcon && (
            <div className="absolute z-100 inset-bs-2 end-2 flex pointer-coarse:p-1.5">
              <ActionIcon
                aria-label={tCommon('close')}
                className="relative pointer-coarse:after:absolute pointer-coarse:after:-inset-[calc(var(--spacing)*1.75)] pointer-coarse:after:content-['']"
                icon={XIcon}
                size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                onClick={() => onCancel?.()}
              />
            </div>
          )}
          <div
            style={{ '--notification-pattern': pattern, ...wrapperStyle } as CSSProperties}
            className={cx(
              cn(
                'flex gap-4 px-5 pbs-5 pbe-4 [background:linear-gradient(180deg,color-mix(in_srgb,var(--card)_0%,transparent),var(--card)_var(--gradient-stop,calc(var(--spacing)*35))),var(--notification-pattern)]',
                isDarkMode
                  ? '[--gradient-stop:calc(var(--spacing)*20)]'
                  : '[--gradient-stop:calc(var(--spacing)*35)]',
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
