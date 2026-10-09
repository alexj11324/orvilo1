'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Commit,
  CommitActions,
  CommitAuthor,
  CommitContent,
  CommitCopyButton,
  CommitHash,
  CommitHeader,
  CommitInfo,
  CommitMessage,
  CommitMetadata,
} from '@/components/ai-elements/commit';
import {
  StackTrace,
  StackTraceActions,
  StackTraceContent,
  StackTraceCopyButton,
  StackTraceError,
  StackTraceErrorMessage,
  StackTraceErrorType,
  StackTraceExpandButton,
  StackTraceFrames,
  StackTraceHeader,
} from '@/components/ai-elements/stack-trace';
import {
  Test,
  TestError,
  TestErrorMessage,
  TestResults,
  TestResultsContent,
  TestResultsHeader,
  TestResultsSummary,
  TestSuite,
  TestSuiteContent,
  TestSuiteName,
} from '@/components/ai-elements/test-results';

import { useToolRenderCapabilities } from '../../context';
import {
  parseErrorStack,
  parseGitCommits,
  parseTestReport,
  resolveStackFilePath,
} from './structuredOutput';

interface StructuredOutputProps {
  view: ReturnType<typeof useStructuredOutput>;
}

export function useStructuredOutput(command: string, output: string) {
  return useMemo(
    () => ({
      tests: parseTestReport(output),
      commits: parseGitCommits(command, output),
      stack: parseErrorStack(output),
    }),
    [command, output],
  );
}

export function StructuredOutput({ view }: StructuredOutputProps) {
  const { t } = useTranslation('chat');
  const { tests, commits, stack } = view;
  const { openFile, canOpenFile } = useToolRenderCapabilities();
  if (tests)
    return (
      <TestResults data-ai-element="test-results" summary={tests.summary}>
        <TestResultsHeader>
          <TestResultsSummary className="flex-wrap" />
        </TestResultsHeader>
        <TestResultsContent className="max-h-96 overflow-auto">
          {tests.suites.map((suite, index) => (
            <TestSuite
              defaultOpen={suite.tests.some((test) => test.status === 'failed')}
              key={`${suite.name}-${index}`}
              name={suite.name}
              status={
                suite.tests.some((test) => test.status === 'failed')
                  ? 'failed'
                  : suite.tests.some((test) => test.status === 'passed')
                    ? 'passed'
                    : 'skipped'
              }
            >
              <TestSuiteName className="break-all" />
              <TestSuiteContent>
                {suite.tests.map((test, index) => (
                  <div key={`${test.name}-${index}`}>
                    <Test duration={test.duration} name={test.name} status={test.status} />
                    {test.errors.length > 0 && (
                      <TestError className="mx-3 mb-3">
                        <TestErrorMessage className="whitespace-pre-wrap break-words">
                          {test.errors.join('\n')}
                        </TestErrorMessage>
                      </TestError>
                    )}
                  </div>
                ))}
              </TestSuiteContent>
            </TestSuite>
          ))}
        </TestResultsContent>
      </TestResults>
    );
  if (commits)
    return (
      <div className="max-h-96 space-y-2 overflow-auto" data-ai-element="commit">
        {commits.map((commit) => (
          <Commit key={commit.hash}>
            <CommitHeader>
              <CommitInfo className="min-w-0 gap-1">
                <CommitMessage className="truncate">{commit.message.split('\n')[0]}</CommitMessage>
                <CommitMetadata className="flex-wrap">
                  <CommitHash>{commit.hash.slice(0, 8)}</CommitHash>
                  <CommitAuthor>{commit.author}</CommitAuthor>
                  <time dateTime={commit.date.toISOString()}>
                    {commit.date.toLocaleDateString()}
                  </time>
                </CommitMetadata>
              </CommitInfo>
              <CommitActions>
                <CommitCopyButton aria-label={t('aiElementsMore.copyHash')} hash={commit.hash} />
              </CommitActions>
            </CommitHeader>
            <CommitContent className="whitespace-pre-wrap break-words border-t p-3 text-sm">
              {commit.message}
            </CommitContent>
          </Commit>
        ))}
      </div>
    );
  if (stack)
    return (
      <StackTrace
        data-ai-element="stack-trace"
        trace={stack}
        canOpenFilePath={(path) => {
          const file = resolveStackFilePath(path);
          return !!file && !!openFile && (canOpenFile?.(file) ?? true);
        }}
        onFilePathClick={(path) => {
          const file = resolveStackFilePath(path);
          if (file && (canOpenFile?.(file) ?? true)) openFile?.(file);
        }}
      >
        <StackTraceHeader>
          <StackTraceError>
            <StackTraceErrorType />
            <StackTraceErrorMessage />
          </StackTraceError>
          <StackTraceActions>
            <StackTraceCopyButton aria-label={t('aiElementsMore.copyStack')} />
          </StackTraceActions>
          <StackTraceExpandButton />
        </StackTraceHeader>
        <StackTraceContent>
          <StackTraceFrames />
        </StackTraceContent>
      </StackTrace>
    );
  return null;
}
