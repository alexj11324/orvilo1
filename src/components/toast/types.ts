import { type CSSProperties, type ReactNode } from 'react';

type ToastType = 'success' | 'info' | 'warning' | 'error' | 'loading' | 'default';
type ToastPosition = 'top' | 'top-left' | 'top-right' | 'bottom' | 'bottom-left' | 'bottom-right';
type ToastActionVariant = 'primary' | 'secondary' | 'text' | 'danger' | 'ghost';

interface ToastAction {
  label: ReactNode;
  onClick?: () => void;
  props?: Omit<React.ComponentPropsWithRef<'button'>, 'onClick'>;
  variant?: ToastActionVariant;
}

interface ToastOptions {
  actionProps?: React.ComponentPropsWithRef<'button'>;
  actions?: ToastAction[];
  className?: string;
  closable?: boolean;
  data?: Record<string, unknown>;
  description?: ReactNode;
  duration?: number;
  hideCloseButton?: boolean;
  icon?: ReactNode;
  id?: string;
  onClose?: () => void;
  onRemove?: () => void;
  placement?: ToastPosition;
  style?: CSSProperties;
  title?: ReactNode;
  type?: ToastType;
}

interface ToastInstance {
  close: () => void;
  id: string;
  update: (options: Partial<ToastOptions>) => void;
}

interface ToastPromiseOptions<T> {
  error: ReactNode | ((error: Error) => ReactNode) | Omit<ToastOptions, 'type'>;
  loading: ReactNode | Omit<ToastOptions, 'type'>;
  success: ReactNode | ((data: T) => ReactNode) | Omit<ToastOptions, 'type'>;
}

interface ToastAPI {
  (options: ToastOptions): ToastInstance;
  dismiss: (id?: string) => void;
  error: (options: Omit<ToastOptions, 'type'> | string) => ToastInstance;
  info: (options: Omit<ToastOptions, 'type'> | string) => ToastInstance;
  loading: (options: Omit<ToastOptions, 'type'> | string) => ToastInstance;
  promise: <T>(promise: Promise<T>, options: ToastPromiseOptions<T>) => Promise<T>;
  success: (options: Omit<ToastOptions, 'type'> | string) => ToastInstance;
  warning: (options: Omit<ToastOptions, 'type'> | string) => ToastInstance;
}

interface ToastHostProps {
  className?: string;
  duration?: number;
  limit?: number;
  position?: ToastPosition;
  root?: HTMLElement | ShadowRoot | null;
  swipeDirection?: ('left' | 'right' | 'up' | 'down') | ('left' | 'right' | 'up' | 'down')[];
}

export type {
  ToastAction,
  ToastActionVariant,
  ToastAPI,
  ToastHostProps,
  ToastInstance,
  ToastOptions,
  ToastPosition,
  ToastPromiseOptions,
  ToastType,
};
