import { cx } from 'antd-style';
import { t } from 'i18next';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { memo, useState } from 'react';

import ActionIcon from '@/components/ActionIcon';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export type ErrorAlertType = 'error' | 'info' | 'secondary' | 'success' | 'warning';

export interface ErrorAlertProps {
  action?: ReactNode;
  afterClose?: () => void;
  className?: string;
  closable?: boolean | { closeIcon?: ReactNode };
  description?: ReactNode;
  extra?: ReactNode;
  extraDefaultExpand?: boolean;
  extraIsolate?: boolean;
  icon?: ReactNode;
  message?: ReactNode;
  onClose?: () => void;
  showIcon?: boolean;
  style?: CSSProperties;
  text?: { detail?: ReactNode };
  title?: ReactNode;
  type?: ErrorAlertType;
  variant?: 'borderless' | 'filled' | 'outlined';
}

const VARIANT_MAP: Record<
  ErrorAlertType,
  'default' | 'destructive' | 'info' | 'success' | 'warning'
> = {
  error: 'destructive',
  info: 'info',
  secondary: 'default',
  success: 'success',
  warning: 'warning',
};

const ICON_MAP: Record<ErrorAlertType, typeof Info> = {
  error: CircleAlert,
  info: Info,
  secondary: Info,
  success: CircleCheck,
  warning: TriangleAlert,
};

const ErrorAlert = memo<ErrorAlertProps>(
  ({
    action,
    afterClose,
    className,
    closable,
    description,
    extra,
    extraDefaultExpand,
    extraIsolate,
    icon,
    message,
    onClose,
    showIcon = true,
    style,
    text,
    title,
    type = 'info',
    variant,
  }) => {
    const TypeIcon = ICON_MAP[type];
    const [visible, setVisible] = useState(true);
    const handleClose = () => {
      onClose?.();
      setVisible(false);
      afterClose?.();
    };

    if (!visible) return null;

    return (
      <Alert
        style={style}
        variant={VARIANT_MAP[type]}
        className={cx(
          'rounded-(--radius-card)',
          variant === 'borderless' && 'border-transparent bg-transparent',
          className,
        )}
      >
        {showIcon ? (icon ?? <TypeIcon />) : null}
        {(title ?? message) != null && (
          <AlertTitle className="font-semibold">{title ?? message}</AlertTitle>
        )}
        {description != null && (
          <AlertDescription className="leading-5.5 [&_p]:leading-5.5">
            {description}
          </AlertDescription>
        )}
        {(action || closable) && (
          <AlertAction>
            {action}
            {closable ? (
              <span className="inline-flex flex-none coarse:p-1.5">
                <ActionIcon
                  className="relative coarse:after:absolute coarse:after:-inset-[calc(var(--spacing)*1.75)] coarse:after:content-['']"
                  icon={X}
                  size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                  title={t('close', { ns: 'common' })}
                  onClick={handleClose}
                />
              </span>
            ) : null}
          </AlertAction>
        )}
        {extra != null &&
          (extraIsolate ? (
            <AlertDescription className="col-start-1 col-span-3 mbs-2 leading-5.5 [&_p]:leading-5.5">
              {extra}
            </AlertDescription>
          ) : (
            <Collapsible className="col-start-2" defaultOpen={extraDefaultExpand}>
              <span className="inline-flex flex-none coarse:p-1.5">
                <CollapsibleTrigger
                  className="relative rounded-(--radius-button) text-sm leading-5.5 text-muted-foreground hover:text-foreground coarse:after:absolute coarse:after:-inset-[calc(var(--spacing)*1.75)] coarse:after:content-['']"
                  render={<Button size="compact" type="button" variant="ghost" />}
                >
                  {text?.detail ?? t('appLoading.showDetail', { ns: 'common' })}
                </CollapsibleTrigger>
              </span>
              <CollapsibleContent>
                <AlertDescription className="leading-5.5 [&_p]:leading-5.5">
                  {extra}
                </AlertDescription>
              </CollapsibleContent>
            </Collapsible>
          ))}
      </Alert>
    );
  },
);

ErrorAlert.displayName = 'ErrorAlert';

export default ErrorAlert;
