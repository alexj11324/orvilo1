import { type ErrorType } from '@orvilo/types';

import { type ErrorAlertProps } from '@/features/Conversation/components/ErrorAlert';

export default function useBusinessErrorAlertConfig(
  _errorType?: ErrorType,
): ErrorAlertProps | undefined {
  return undefined;
}
