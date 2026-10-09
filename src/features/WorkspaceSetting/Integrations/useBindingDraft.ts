import { useLocalStorageState } from '@/hooks/useLocalStorageState';

export interface BindingDraft {
  agentId: string;
  slackChannelId: string;
}

export const useBindingDraft = (key: string, initial: BindingDraft) => {
  const [draft, setDraft] = useLocalStorageState(key, initial);
  return {
    draft,
    setDraft,
    // A successful edit must persist the saved selection, not the opening selection.
    markSaved: (saved: BindingDraft) => setDraft(saved),
  };
};
