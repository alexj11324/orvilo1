import { ORVILO_USER_ID } from '@/const/fetch';
import { useUserStore } from '@/store/user';

/**
 * Headers for the server-side TTS endpoint. User-provider keyVault injection
 * was removed together with BYOK provider management — credentials resolve on
 * the server now.
 *
 * TODO: Need to be removed after tts refactor
 * @deprecated
 */
export const createHeaderWithOpenAI = (header?: HeadersInit): HeadersInit => {
  const state = useUserStore.getState();

  return {
    ...header,
    [ORVILO_USER_ID]: state.user?.id || '',
  };
};
