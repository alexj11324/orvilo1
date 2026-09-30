'use client';

import { memo } from 'react';
import { type ExternalToast, toast as sonnerToast } from 'sonner';

import { Toaster } from '@/components/ui/sonner';

import type {
  ToastAction,
  ToastAPI,
  ToastHostProps,
  ToastInstance,
  ToastOptions,
  ToastPosition,
  ToastPromiseOptions,
  ToastType,
} from './types';

const DEFAULT_DURATION = 5000;

const mapPosition = (placement?: ToastPosition): ExternalToast['position'] => {
  switch (placement) {
    case 'top': {
      return 'top-center';
    }
    case 'bottom': {
      return 'bottom-center';
    }
    default: {
      return placement;
    }
  }
};

const toSonnerOptions = (options: ToastOptions): ExternalToast => {
  const {
    actions,
    className,
    closable,
    description,
    duration,
    hideCloseButton,
    icon,
    id,
    onClose,
    onRemove,
    placement,
    style,
  } = options;

  const external: ExternalToast = {
    className,
    description,
    duration: duration ?? DEFAULT_DURATION,
    id,
    position: mapPosition(placement),
    style,
  };

  if (icon !== undefined && icon !== null) {
    // lobehub `icon` is a Lucide component reference; sonner wants a node.
    external.icon = typeof icon === 'function' ? sonnerIconElement(icon) : icon;
  }

  if (closable === false || hideCloseButton) external.closeButton = false;

  if (actions && actions.length > 0) {
    const [first, second] = actions;
    if (first) {
      external.action = {
        label: first.label,
        onClick: () => first.onClick?.(),
        ...(first.props?.style ? { actionButtonStyle: first.props.style } : {}),
      };
    }
    if (second) {
      external.cancel = {
        label: second.label,
        onClick: () => second.onClick?.(),
        ...(second.props?.style ? { actionButtonStyle: second.props.style } : {}),
      };
    }
  }

  if (onClose) external.onDismiss = () => onClose();
  if (onRemove) {
    const prev = external.onDismiss;
    external.onAutoClose = () => onRemove();
    external.onDismiss = () => {
      prev?.({} as never);
      onRemove();
    };
  }

  return external;
};

// kept outside toSonnerOptions so a component reference stays a component
const sonnerIconElement = (IconComponent: React.ElementType) => <IconComponent />;

const isOptionsObject = (input: unknown): input is Omit<ToastOptions, 'type'> =>
  typeof input === 'object' && input !== null;

const issue = (options: ToastOptions): ToastInstance => {
  const { type = 'default', title } = options;

  let id: string | number;
  if (options.actions && options.actions.length > 2) {
    // sonner only supports action+cancel; render all actions in a custom toast
    id = sonnerToast.custom(
      () => (
        <div className="flex flex-col gap-2">
          {title ? <div className="font-medium">{title}</div> : null}
          {options.description ? (
            <div className="text-sm text-muted-foreground">{options.description}</div>
          ) : null}
          <div className="flex gap-2">
            {options.actions.map((action: ToastAction, i: number) => (
              <button key={i} type="button" {...action.props} onClick={action.onClick}>
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ),
      toSonnerOptions(options),
    );
  } else {
    const data = toSonnerOptions(options);
    switch (type) {
      case 'success': {
        id = sonnerToast.success(title, data);
        break;
      }
      case 'info': {
        id = sonnerToast.info(title, data);
        break;
      }
      case 'warning': {
        id = sonnerToast.warning(title, data);
        break;
      }
      case 'error': {
        id = sonnerToast.error(title, data);
        break;
      }
      case 'loading': {
        id = sonnerToast.loading(title, data);
        break;
      }
      default: {
        id = sonnerToast(title ?? '', data);
      }
    }
  }

  return {
    close: () => sonnerToast.dismiss(id),
    id: String(id),
    update: (next: Partial<ToastOptions>) => issue({ ...options, ...next, id: String(id) }),
  };
};

const toast = ((options: ToastOptions) => issue(options)) as ToastAPI;

const makeVariant =
  (type: ToastType) =>
  (options: Omit<ToastOptions, 'type'> | string): ToastInstance =>
    issue(isOptionsObject(options) ? { ...options, type } : { title: options, type });

toast.success = makeVariant('success');
toast.error = makeVariant('error');
toast.info = makeVariant('info');
toast.warning = makeVariant('warning');
toast.loading = makeVariant('loading');

toast.dismiss = (id?: string) => {
  sonnerToast.dismiss(id);
};

toast.promise = <T,>(promise: Promise<T>, options: ToastPromiseOptions<T>): Promise<T> => {
  const resolveOptions = (
    value: React.ReactNode | ((data: never) => React.ReactNode) | Omit<ToastOptions, 'type'>,
    data?: unknown,
    type?: ToastType,
  ): ToastOptions => {
    if (typeof value === 'function')
      return { title: (value as (d: unknown) => React.ReactNode)(data), type };
    if (isOptionsObject(value)) return { ...value, type };
    return { title: value, type };
  };

  const loadingId = issue(resolveOptions(options.loading, undefined, 'loading')).id;

  promise.then(
    (data) => {
      issue({ ...resolveOptions(options.success, data, 'success'), id: loadingId });
    },
    (error) => {
      issue({
        ...resolveOptions(
          options.error,
          error instanceof Error ? error : new Error(String(error)),
          'error',
        ),
        id: loadingId,
      });
    },
  );

  return promise;
};

const useToast = (): ToastAPI => toast;

const SWIPE_MAP = { down: 'bottom', left: 'left', right: 'right', up: 'top' } as const;

const ToastHost = memo<ToastHostProps>(
  ({ className, duration, limit, position, swipeDirection }) => (
    <Toaster
      className={className}
      duration={duration}
      position={mapPosition(position) ?? 'bottom-right'}
      visibleToasts={limit ?? 5}
      swipeDirections={
        swipeDirection
          ? (Array.isArray(swipeDirection) ? swipeDirection : [swipeDirection]).map(
              (d) => SWIPE_MAP[d],
            )
          : undefined
      }
    />
  ),
);
ToastHost.displayName = 'ToastHost';

export { toast, ToastHost, useToast };
export type {
  ToastAction,
  ToastAPI,
  ToastHostProps,
  ToastInstance,
  ToastOptions,
  ToastPosition,
  ToastPromiseOptions,
  ToastType,
} from './types';
