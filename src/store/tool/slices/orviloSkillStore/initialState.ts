import { type OrviloSkillServer } from './types';

/**
 * Orvilo Skill Store state interface
 *
 * NOTE: All connection states and tool data are fetched in real-time from Market API, not stored in local database
 */
export interface OrviloSkillStoreState {
  /** Set of executing tool call IDs */
  orviloSkillExecutingToolIds: Set<string>;
  /** Set of loading Provider IDs */
  orviloSkillLoadingIds: Set<string>;
  /** List of connected Orvilo Skill Servers */
  orviloSkillServers: OrviloSkillServer[];
}

/**
 * Orvilo Skill Store initial state
 */
export const initialOrviloSkillStoreState: OrviloSkillStoreState = {
  orviloSkillExecutingToolIds: new Set(),
  orviloSkillLoadingIds: new Set(),
  orviloSkillServers: [],
};
