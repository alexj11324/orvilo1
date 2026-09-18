import type { MarkdownPatchHunk } from '@orvilo/markdown-patch';

export const WebOnboardingIdentifier = 'orvilo-web-onboarding';

export const WebOnboardingApiName = {
  finishOnboarding: 'finishOnboarding',
  readDocument: 'readDocument',
  saveUserQuestion: 'saveUserQuestion',
  showAgentMarketplace: 'showAgentMarketplace',
  submitAgentPick: 'submitAgentPick',
  updateDocument: 'updateDocument',
  writeDocument: 'writeDocument',
} as const;

export type WebOnboardingDocumentType = 'persona' | 'soul';

export interface UpdateDocumentArgs {
  hunks: MarkdownPatchHunk[];
  type: WebOnboardingDocumentType;
}
