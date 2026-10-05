import type { ChatTopicMetadata } from '@orvilo/types';

export const getHeteroWorkingDirectoryKey = (workingDirectory: string | undefined): string =>
  workingDirectory ?? '';

export const getHeteroSessionIdForWorkingDirectory = (
  metadata: ChatTopicMetadata | null | undefined,
  workingDirectory: string | undefined,
): string | undefined => {
  const key = getHeteroWorkingDirectoryKey(workingDirectory);
  return metadata?.heteroSessionIdByWorkingDirectory?.[key];
};

export const getHeteroSessionBindingKeyForWorkingDirectory = (
  metadata: ChatTopicMetadata | null | undefined,
  workingDirectory: string | undefined,
): string | undefined => {
  const key = getHeteroWorkingDirectoryKey(workingDirectory);
  return metadata?.heteroSessionBindingKeyByWorkingDirectory?.[key];
};

export const setHeteroSessionIdForWorkingDirectory = (
  metadata: ChatTopicMetadata | null | undefined,
  workingDirectory: string | undefined,
  sessionId: string,
): Record<string, string> => ({
  ...metadata?.heteroSessionIdByWorkingDirectory,
  [getHeteroWorkingDirectoryKey(workingDirectory)]: sessionId,
});

export const setHeteroSessionBindingKeyForWorkingDirectory = (
  metadata: ChatTopicMetadata | null | undefined,
  workingDirectory: string | undefined,
  bindingKey: string,
): Record<string, string> => ({
  ...metadata?.heteroSessionBindingKeyByWorkingDirectory,
  [getHeteroWorkingDirectoryKey(workingDirectory)]: bindingKey,
});

export const removeHeteroSessionIdForWorkingDirectory = (
  metadata: ChatTopicMetadata | null | undefined,
  workingDirectory: string | undefined,
): Record<string, string> => {
  const next = { ...metadata?.heteroSessionIdByWorkingDirectory };
  delete next[getHeteroWorkingDirectoryKey(workingDirectory)];
  return next;
};

export const removeHeteroSessionBindingKeyForWorkingDirectory = (
  metadata: ChatTopicMetadata | null | undefined,
  workingDirectory: string | undefined,
): Record<string, string> => {
  const next = { ...metadata?.heteroSessionBindingKeyByWorkingDirectory };
  delete next[getHeteroWorkingDirectoryKey(workingDirectory)];
  return next;
};
