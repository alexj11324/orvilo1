import { type ActionKeys } from '@/features/ChatInput';

/**
 * Action keys for the Agent Builder composer. The builder edits the agent's
 * configuration in-place, so the composer offers the AGENT selector — never a
 * model picker: work surfaces carry no raw model selection (that lives only in
 * Settings → Agents). Guarded by composerActions.test.ts.
 */
export const builderLeftActions: ActionKeys[] = [];
export const builderRightActions: ActionKeys[] = ['agent'];
