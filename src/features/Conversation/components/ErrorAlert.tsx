import { cx } from 'antd-style';
import { t } from 'i18next';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { memo, useState } from 'react';

import ActionIcon from '@/components/ActionIcon';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
        className={cx(variant === 'borderless' && 'border-transparent bg-transparent', className)}
        style={style}
        variant={VARIANT_MAP[type]}
      >
        {showIcon ? (icon ?? <TypeIcon />) : null}
        {(title ?? message) != null && <AlertTitle>{title ?? message}</AlertTitle>}
        {description != null && <AlertDescription>{description}</AlertDescription>}
        {(action || closable) && (
          <AlertAction>
            {action}
            {closable ? (
              <ActionIcon
                icon={X}
                size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 14 }}
                title={t('close', { ns: 'common' })}
                onClick={handleClose}
              />
            ) : null}
          </AlertAction>
        )}
        {extra != null &&
          (extraIsolate ? (
            <AlertDescription className="col-start-1 col-span-3 mt-2">{extra}</AlertDescription>
          ) : (
            <Collapsible className="col-start-2" defaultOpen={extraDefaultExpand}>
              <CollapsibleTrigger className="min-h-8 rounded-(--radius-button) text-sm leading-5.5 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2">
                {text?.detail ?? t('appLoading.showDetail', { ns: 'common' })}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <AlertDescription>{extra}</AlertDescription>
              </CollapsibleContent>
            </Collapsible>
          ))}
      </Alert>
    );
  },
);

ErrorAlert.displayName = 'ErrorAlert';

export default ErrorAlert;
