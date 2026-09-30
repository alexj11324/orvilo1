import { cx } from 'antd-style';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { memo } from 'react';

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
    title,
    type = 'info',
    variant,
  }) => {
    const TypeIcon = ICON_MAP[type];
    const handleClose = () => {
      onClose?.();
      afterClose?.();
    };

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
            {closable ? <ActionIcon icon={X} size="small" onClick={handleClose} /> : null}
          </AlertAction>
        )}
        {extra != null &&
          (extraIsolate ? (
            <AlertDescription className="col-start-1 col-span-3 mt-2">{extra}</AlertDescription>
          ) : (
            <Collapsible className="col-start-2" defaultOpen={extraDefaultExpand}>
              <CollapsibleTrigger className="text-xs text-muted-foreground">
                Show Details
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
