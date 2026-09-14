import type { UIChatMessage } from '@orvilo/types';

import { isLocalOnlyMessage } from '@/store/chat/utils/localMessages';

export const getMessageInteractionState = (
  message: UIChatMessage | undefined,
  disableEditing?: boolean,
) => {
  const isLocalOnly = isLocalOnlyMessage(message);

  return {
    effectiveDisableEditing: Boolean(disableEditing || isLocalOnly),
    shouldSuppressContextMenu: isLocalOnly,
  };
};
