'use client';

import { type ComponentType, memo, type ReactNode, useCallback } from 'react';

import AlertFallback from './AlertFallback';
import CatchBoundary, { type FallbackRenderProps } from './CatchBoundary';
import SilentFallback from './SilentFallback';

export type ErrorBoundaryVariant = 'alert' | 'silent';

interface SafeBoundaryProps {
  alertTitle?: string;
  children: ReactNode;
  minHeight?: number;
  onError?: (error: unknown, info: { componentStack?: string | null }) => void;
  resetKeys?: unknown[];
  variant?: ErrorBoundaryVariant;
}

const SafeBoundary = memo<SafeBoundaryProps>(
  ({ children, variant = 'silent', alertTitle, minHeight, resetKeys, onError }) => {
    const fallbackRender = useCallback(
      (props: FallbackRenderProps) => {
        const error = props.error instanceof Error ? props.error : new Error(String(props.error));
        if (variant === 'alert') {
          return (
            <AlertFallback
              error={error}
              resetErrorBoundary={props.resetErrorBoundary}
              title={alertTitle}
            />
          );
        }
        return <SilentFallback minHeight={minHeight} />;
      },
      [variant, alertTitle, minHeight],
    );

    return (
      <CatchBoundary fallbackRender={fallbackRender} resetKeys={resetKeys} onError={onError}>
        {children}
      </CatchBoundary>
    );
  },
);

SafeBoundary.displayName = 'SafeBoundary';

export function withErrorBoundary<P extends object>(
  Component: ComponentType<P>,
  options?: { alertTitle?: string; minHeight?: number; variant?: ErrorBoundaryVariant },
): ComponentType<P> {
  const Wrapped = (props: P) => (
    <SafeBoundary
      alertTitle={options?.alertTitle}
      minHeight={options?.minHeight}
      variant={options?.variant}
    >
      <Component {...props} />
    </SafeBoundary>
  );

  Wrapped.displayName = `withErrorBoundary(${Component.displayName || Component.name || 'Component'})`;
  return Wrapped;
}

export { AlertFallback, SafeBoundary, SilentFallback };
export default SafeBoundary;
