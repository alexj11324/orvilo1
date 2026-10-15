'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface FallbackRenderProps {
  error: unknown;
  resetErrorBoundary: (...args: unknown[]) => void;
}

interface CatchBoundaryProps {
  children: ReactNode;
  fallbackRender: (props: FallbackRenderProps) => ReactNode;
  onError?: (error: unknown, info: { componentStack?: string | null }) => void;
  /** Any changed entry clears a caught error, like react-error-boundary's `resetKeys`. */
  resetKeys?: unknown[];
}

type CatchBoundaryState = { caught: false } | { caught: true; error: unknown };

const keysChanged = (prev: unknown[] = [], next: unknown[] = []) =>
  prev.length !== next.length || prev.some((key, index) => !Object.is(key, next[index]));

/** Minimal render-error boundary: renders `fallbackRender` until reset. */
class CatchBoundary extends Component<CatchBoundaryProps, CatchBoundaryState> {
  public state: CatchBoundaryState = { caught: false };

  public static getDerivedStateFromError(error: unknown): CatchBoundaryState {
    return { caught: true, error };
  }

  public componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  public componentDidUpdate(prevProps: CatchBoundaryProps, prevState: CatchBoundaryState) {
    // Skip the update that just caught the error; only later key changes reset it.
    if (
      this.state.caught &&
      prevState.caught &&
      keysChanged(prevProps.resetKeys, this.props.resetKeys)
    ) {
      this.setState({ caught: false });
    }
  }

  private resetErrorBoundary = () => {
    if (this.state.caught) this.setState({ caught: false });
  };

  public render() {
    if (!this.state.caught) return this.props.children;
    return this.props.fallbackRender({
      error: this.state.error,
      resetErrorBoundary: this.resetErrorBoundary,
    });
  }
}

export default CatchBoundary;
