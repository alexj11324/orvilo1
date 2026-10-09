'use client';

import { cn } from 'cn';
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleDotIcon,
  CircleIcon,
  XCircleIcon,
} from 'lucide-react';
import type { ComponentProps, HTMLAttributes } from 'react';
import { createContext, use, useMemo } from 'react';
import { Trans } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

type TestStatus = 'passed' | 'failed' | 'skipped' | 'running';

interface TestResultsSummary {
  duration?: number;
  failed: number;
  passed: number;
  skipped: number;
  total: number;
}

interface TestResultsContextType {
  summary?: TestResultsSummary;
}

const TestResultsContext = createContext<TestResultsContextType>({});

const formatDuration = (ms: number) => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
};

export type TestResultsHeaderProps = HTMLAttributes<HTMLDivElement>;

export const TestResultsHeader = ({ className, children, ...props }: TestResultsHeaderProps) => (
  <div className={cn('flex items-center justify-between border-b px-4 py-3', className)} {...props}>
    {children}
  </div>
);

export type TestResultsDurationProps = HTMLAttributes<HTMLSpanElement>;

export const TestResultsDuration = ({
  className,
  children,
  ...props
}: TestResultsDurationProps) => {
  const { summary } = use(TestResultsContext);

  if (!summary?.duration) {
    return null;
  }

  return (
    <span className={cn('text-muted-foreground text-sm', className)} {...props}>
      {children ?? formatDuration(summary.duration)}
    </span>
  );
};

export type TestResultsSummaryProps = HTMLAttributes<HTMLDivElement>;

export const TestResultsSummary = ({ className, children, ...props }: TestResultsSummaryProps) => {
  const { summary } = use(TestResultsContext);

  if (!summary) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-3', className)} {...props}>
      {children ?? (
        <>
          <Badge
            className="gap-1 bg-success/10 text-success-text dark:bg-success/10 dark:text-success-text"
            variant="secondary"
          >
            <CheckCircle2Icon className="size-3" />
            <Trans count={summary.passed} i18nKey="aiElementsMore.passed" ns="chat" />
          </Badge>
          {summary.failed > 0 && (
            <Badge
              className="gap-1 bg-destructive/10 text-destructive-text dark:bg-destructive/10 dark:text-destructive-text"
              variant="secondary"
            >
              <XCircleIcon className="size-3" />
              <Trans count={summary.failed} i18nKey="aiElementsMore.failed" ns="chat" />
            </Badge>
          )}
          {summary.skipped > 0 && (
            <Badge
              className="gap-1 bg-warning/10 text-warning-text dark:bg-warning/10 dark:text-warning-text"
              variant="secondary"
            >
              <CircleIcon className="size-3" />
              <Trans count={summary.skipped} i18nKey="aiElementsMore.skipped" ns="chat" />
            </Badge>
          )}
        </>
      )}
    </div>
  );
};

export type TestResultsProps = HTMLAttributes<HTMLDivElement> & {
  summary?: TestResultsSummary;
};

export const TestResults = ({ summary, className, children, ...props }: TestResultsProps) => {
  const contextValue = useMemo(() => ({ summary }), [summary]);

  return (
    <TestResultsContext value={contextValue}>
      <div className={cn('rounded-lg border bg-card', className)} {...props}>
        {children ??
          (summary && (
            <TestResultsHeader>
              <TestResultsSummary />
              <TestResultsDuration />
            </TestResultsHeader>
          ))}
      </div>
    </TestResultsContext>
  );
};

export type TestResultsProgressProps = HTMLAttributes<HTMLDivElement>;

export const TestResultsProgress = ({
  className,
  children,
  ...props
}: TestResultsProgressProps) => {
  const { summary } = use(TestResultsContext);

  if (!summary) {
    return null;
  }

  const passedPercent = summary.total > 0 ? (summary.passed / summary.total) * 100 : 0;
  const failedPercent = summary.total > 0 ? (summary.failed / summary.total) * 100 : 0;

  return (
    <div className={cn('space-y-2', className)} {...props}>
      {children ?? (
        <>
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            <div className="bg-success/10 transition-all" style={{ width: `${passedPercent}%` }} />
            <div
              className="bg-destructive/10 transition-all"
              style={{ width: `${failedPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-muted-foreground text-xs">
            <span>
              {summary.passed}/{summary.total} tests passed
            </span>
            <span>{passedPercent.toFixed(0)}%</span>
          </div>
        </>
      )}
    </div>
  );
};

export type TestResultsContentProps = HTMLAttributes<HTMLDivElement>;

export const TestResultsContent = ({ className, children, ...props }: TestResultsContentProps) => (
  <div className={cn('space-y-2 p-4', className)} {...props}>
    {children}
  </div>
);

interface TestSuiteContextType {
  name: string;
  status: TestStatus;
}

const TestSuiteContext = createContext<TestSuiteContextType>({
  name: '',
  status: 'passed',
});

const statusStyles: Record<TestStatus, string> = {
  failed: 'text-destructive-text',
  passed: 'text-success-text',
  running: 'text-info-text',
  skipped: 'text-warning-text',
};

const statusIcons: Record<TestStatus, React.ReactNode> = {
  failed: <XCircleIcon className="size-4" />,
  passed: <CheckCircle2Icon className="size-4" />,
  running: <CircleDotIcon className="size-4 animate-pulse" />,
  skipped: <CircleIcon className="size-4" />,
};

const TestStatusIcon = ({ status }: { status: TestStatus }) => (
  <span className={cn('shrink-0', statusStyles[status])}>{statusIcons[status]}</span>
);

export type TestSuiteProps = ComponentProps<typeof Collapsible> & {
  name: string;
  status: TestStatus;
};

export const TestSuite = ({ name, status, className, children, ...props }: TestSuiteProps) => {
  const contextValue = useMemo(() => ({ name, status }), [name, status]);

  return (
    <TestSuiteContext value={contextValue}>
      <Collapsible className={cn('rounded-lg border', className)} {...props}>
        {children}
      </Collapsible>
    </TestSuiteContext>
  );
};

export type TestSuiteNameProps = ComponentProps<typeof CollapsibleTrigger>;

export const TestSuiteName = ({ className, children, ...props }: TestSuiteNameProps) => {
  const { name, status } = use(TestSuiteContext);

  return (
    <CollapsibleTrigger
      className={cn(
        'group flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50',
        className,
      )}
      {...props}
    >
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[open]:rotate-90" />
      <TestStatusIcon status={status} />
      <span className="font-medium text-sm">{children ?? name}</span>
    </CollapsibleTrigger>
  );
};

export type TestSuiteStatsProps = HTMLAttributes<HTMLDivElement> & {
  passed?: number;
  failed?: number;
  skipped?: number;
};

export const TestSuiteStats = ({
  passed = 0,
  failed = 0,
  skipped = 0,
  className,
  children,
  ...props
}: TestSuiteStatsProps) => (
  <div className={cn('ml-auto flex items-center gap-2 text-xs', className)} {...props}>
    {children ?? (
      <>
        {passed > 0 && (
          <span className="text-success-text">
            <Trans count={passed} i18nKey="aiElementsMore.passed" ns="chat" />
          </span>
        )}
        {failed > 0 && (
          <span className="text-destructive-text">
            <Trans count={failed} i18nKey="aiElementsMore.failed" ns="chat" />
          </span>
        )}
        {skipped > 0 && (
          <span className="text-warning-text">
            <Trans count={skipped} i18nKey="aiElementsMore.skipped" ns="chat" />
          </span>
        )}
      </>
    )}
  </div>
);

export type TestSuiteContentProps = ComponentProps<typeof CollapsibleContent>;

export const TestSuiteContent = ({ className, children, ...props }: TestSuiteContentProps) => (
  <CollapsibleContent className={cn('border-t', className)} {...props}>
    <div className="divide-y">{children}</div>
  </CollapsibleContent>
);

interface TestContextType {
  duration?: number;
  name: string;
  status: TestStatus;
}

const TestContext = createContext<TestContextType>({
  name: '',
  status: 'passed',
});

export type TestNameProps = HTMLAttributes<HTMLSpanElement>;

export const TestName = ({ className, children, ...props }: TestNameProps) => {
  const { name } = use(TestContext);

  return (
    <span className={cn('flex-1', className)} {...props}>
      {children ?? name}
    </span>
  );
};

export type TestDurationProps = HTMLAttributes<HTMLSpanElement>;

export const TestDuration = ({ className, children, ...props }: TestDurationProps) => {
  const { duration } = use(TestContext);

  if (duration === undefined) {
    return null;
  }

  return (
    <span className={cn('ml-auto text-muted-foreground text-xs', className)} {...props}>
      {children ?? `${duration}ms`}
    </span>
  );
};

export type TestStatusProps = HTMLAttributes<HTMLSpanElement>;

export const TestStatus = ({ className, children, ...props }: TestStatusProps) => {
  const { status } = use(TestContext);

  return (
    <span className={cn('shrink-0', statusStyles[status], className)} {...props}>
      {children ?? statusIcons[status]}
    </span>
  );
};

export type TestProps = HTMLAttributes<HTMLDivElement> & {
  name: string;
  status: TestStatus;
  duration?: number;
};

export const Test = ({ name, status, duration, className, children, ...props }: TestProps) => {
  const contextValue = useMemo(() => ({ duration, name, status }), [duration, name, status]);

  return (
    <TestContext value={contextValue}>
      <div className={cn('flex items-center gap-2 px-4 py-2 text-sm', className)} {...props}>
        {children ?? (
          <>
            <TestStatus />
            <TestName />
            {duration !== undefined && <TestDuration />}
          </>
        )}
      </div>
    </TestContext>
  );
};

export type TestErrorProps = HTMLAttributes<HTMLDivElement>;

export const TestError = ({ className, children, ...props }: TestErrorProps) => (
  <div
    className={cn('mt-2 rounded-md bg-destructive/10 p-3 dark:bg-destructive/10', className)}
    {...props}
  >
    {children}
  </div>
);

export type TestErrorMessageProps = HTMLAttributes<HTMLParagraphElement>;

export const TestErrorMessage = ({ className, children, ...props }: TestErrorMessageProps) => (
  <p
    className={cn(
      'font-medium text-destructive-text text-sm dark:text-destructive-text',
      className,
    )}
    {...props}
  >
    {children}
  </p>
);

export type TestErrorStackProps = HTMLAttributes<HTMLPreElement>;

export const TestErrorStack = ({ className, children, ...props }: TestErrorStackProps) => (
  <pre
    className={cn(
      'mt-2 overflow-auto font-mono text-destructive-text text-xs dark:text-destructive-text',
      className,
    )}
    {...props}
  >
    {children}
  </pre>
);
