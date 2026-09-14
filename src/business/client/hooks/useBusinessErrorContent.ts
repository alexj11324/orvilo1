import type { ChatMessageError } from '@orvilo/types';

export interface BusinessErrorContentResult {
  errorType?: string;
  hideMessage?: boolean;
  message?: string;
}

export default function useBusinessErrorContent(
  _error?: ChatMessageError | null,
): BusinessErrorContentResult {
  return {};
}
