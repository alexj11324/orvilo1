import { type ErrorType } from '@orvilo/types';
import { type ComponentProps } from 'react';

import { type Alert } from '@/components/ui/alert';

export default function useBusinessErrorAlertConfig(
  _errorType?: ErrorType,
): ComponentProps<typeof Alert> | undefined {
  return undefined;
}
