import type { PartialDeep } from 'type-fest';
import { z } from 'zod';

import type { Plans } from '../subscription';
import type { TopicGroupMode, TopicSortBy } from '../topic';
import type { UserAgentOnboarding } from './agentOnboarding';
import type { UserOnboarding } from './onboarding';
import type { UserSettings } from './settings';
import type { NotificationSettings } from './settings/notification';

/**
 * Per-user preferences that only make sense inside a specific workspace.
 *
 * Stored in its own DB table (`workspace_user_settings`, PK
 * `(workspace_id, user_id)`) — the workspace-scoped counterpart to
 * `user_settings`. The dedicated table lets:
 *   - workspace / user delete cascade take out every trace in one shot;
 *   - member-list queries stay leak-free (they hit `workspace_members`, not
 *     this table);
 *   - the "workspace-scoped user preference" boundary be obvious at the
 *     schema layer.
 *
 * A single jsonb `preference` column holds this shape today (matches how
 * `users.preference` scales); if a future family grows large enough to
 * deserve its own column (à la `user_settings.hotkey` / `user_settings.tts`),
 * split it out at that point.
 */
/**
 * Per-user sidebar layout config for one workspace. Mirrors the two
 * client-side `status.workspace.*` overlay fields that are worth syncing
 * across devices; expansion state stays device-local.
 */
export interface SidebarLayoutPreference {
  /** Section keys hidden from the sidebar (customize-sidebar "Hide"). */
  hiddenSections?: string[];
  /** Full sidebar item order, including the flex-spacer sentinel. */
  items?: string[];
}

export interface WorkspaceUserPreference {
  /** Per-member Agent/Chat runtime mode for shared workspace agents. */
  agentModeOverrides?: Record<string /* agentId */, boolean>;
  /** The Agent this member's entry points open by default in this workspace; null clears it. */
  defaultAgentId?: string | null;
  /**
   * Legacy notification preferences, retained for storage/API compatibility.
   * Inbox records are always kept for relevant events. External notification
   * delivery uses personal user_settings.notification; this workspace bag
   * does not override it.
   */
  notification?: NotificationSettings;
  /** This member's default Orchestrator in this workspace; null clears it. */
  orchestratorAgentId?: string | null;
  /**
   * Per-member sidebar sections layout (order + hidden sections). Written as
   * a complete object on every update — partial patches would drop the
   * sibling field through the model's top-level merge.
   */
  sidebar?: SidebarLayoutPreference;
  /**
   * Explicit per-member sidebar membership for workspace Agents / chat groups
   * (itemId -> visible). The workspace sidebar is a shared structure, so every
   * item a member can see is listed by default; an entry here is that member's
   * personal opt-out (`false`) or an explicit re-show of something the legacy
   * hidden-id list removed. An explicit entry always wins over that list.
   */
  sidebarAgentVisibilityOverrides?: Record<string /* itemId */, boolean>;
  /**
   * Per-member folder assignment for sidebar items.
   *
   * @deprecated Folder membership is workspace-shared again — it lives on the
   *   `agents.sessionGroupId` / `chat_groups.groupId` columns. Existing keys
   *   are ignored; nothing reads or writes this map.
   */
  sidebarGroupAssignments?: Record<string /* itemId */, string | null>;
  /**
   * Sidebar agents/chat-groups the caller removed from their own sidebar
   * before ownership-based workspace defaults were introduced. Retained for
   * backward compatibility; new workspace writes use
   * `sidebarAgentVisibilityOverrides`. Personal mode still uses this list.
   */
  sidebarHiddenAgentIds?: string[];
  /**
   * Sidebar folders (Categories) the caller removed from their own sidebar in
   * this workspace. Folders themselves are shared, so this is the personal
   * mask over them: absent id = shown. Hiding a folder hides the whole
   * section, its items included — they stay reachable from the agents list.
   */
  sidebarHiddenGroupIds?: string[];
  /**
   * Per-member pins for sidebar items.
   *
   * @deprecated Pinning is workspace-shared again — it lives on the
   *   `agents.pinned` / `chat_groups.pinned` columns. Existing keys are
   *   ignored; nothing reads or writes this map.
   */
  sidebarPinnedOverrides?: Record<string /* itemId */, boolean>;
}

export interface OrviloUser {
  avatar?: string;
  email?: string | null;
  firstName?: string | null;
  fullName?: string | null;
  id: string;
  interests?: string[];
  jobTitle?: string | null;
  latestName?: string | null;
  username?: string | null;
}

export const UserGuideSchema = z.object({
  /**
   * Move the settings button to the avatar dropdown
   */
  moveSettingsToAvatar: z.boolean().optional(),

  /**
   * Topic Guide
   */
  topic: z.boolean().optional(),

  /**
   * tell user that uploaded files can be found in knowledge base
   */
  uploadFileInKnowledgeBase: z.boolean().optional(),
});

export type UserGuide = z.infer<typeof UserGuideSchema>;

export interface UserPreference {
  /** The Agent personal entry points open by default; null clears it. */
  defaultAgentId?: string | null;
  /** Last-used app for "Open working directory in…" split button. Empty/unknown values fall back to platform default. */
  defaultOpenInApp?: string;
  /**
   * disable markdown rendering in chat input editor
   */
  disableInputMarkdownRender?: boolean;
  /**
   * CSS font-family value used as the global default UI font.
   * Empty or whitespace-only values fall back to the application font stack.
   */
  fontFamily?: string;
  guide?: UserGuide;
  hideSyncAlert?: boolean;
  /**
   * Last active workspace id. Used on cloud to land the user back in the
   * workspace they last used when they open `/` — `null` means personal
   * context. Stored as id (not slug) so workspace renames don't invalidate it.
   */
  lastWorkspaceId?: string | null;
  /** Default saved Agent for future personal Orchestrator creation; null clears it. */
  orchestratorAgentId?: string | null;
  /** Whether teammates can see this user's pointer and presence on the issue they are viewing. */
  showInCollaboration?: boolean;
  /**
   * Personal-mode counterpart of
   * {@link WorkspaceUserPreference.sidebarHiddenAgentIds}: agents/chat-groups
   * removed from the personal sidebar via the View All page.
   */
  sidebarHiddenAgentIds?: string[];
  /**
   * Personal-mode counterpart of
   * {@link WorkspaceUserPreference.sidebarHiddenGroupIds}: folders
   * (Categories) hidden from the personal sidebar via Category Management.
   */
  sidebarHiddenGroupIds?: string[];
  /**
   * @deprecated Use settings.general.telemetry instead
   */
  telemetry?: boolean | null;
  /**
   * CSS font-family value used by the desktop built-in terminal.
   * Empty or whitespace-only values fall back to the application code font.
   */
  terminalFontFamily?: string;
  topicGroupMode?: TopicGroupMode;
  /**
   * whether to include completed topics in the topic list
   */
  topicIncludeCompleted?: boolean;
  topicSortBy?: TopicSortBy;
  /**
   * whether to use cmd + enter to send message
   */
  useCmdEnterToSend?: boolean;
}

export type ReferralStatusString =
  'pending_reward' | 'registered' | 'suspected' | 'rewarded' | 'revoked';

export interface UserInitializationState {
  agentOnboarding?: UserAgentOnboarding;
  avatar?: string;
  canEnablePWAGuide?: boolean;
  canEnableTrace?: boolean;
  email?: string;
  firstName?: string;
  fullName?: string;
  hasConversation?: boolean;
  interests?: string[];
  isFreePlan?: boolean;
  /** @deprecated Use onboarding field instead */
  isOnboard?: boolean;
  jobTitle?: string | null;
  lastName?: string;
  onboarding?: UserOnboarding;
  preference: UserPreference;
  /**
   * Referral lifecycle status for the current user (invitee side).
   */
  referralStatus?: ReferralStatusString;
  settings: PartialDeep<UserSettings>;
  subscriptionPlan?: Plans;
  userId?: string;
  username?: string;
}

export const OAuthAccountSchema = z.object({
  provider: z.string(),
  providerAccountId: z.string(),
});

/**
 * SSO Provider info displayed in profile page
 */
export interface SSOProvider {
  email?: string;
  /** Expiration time */
  expiresAt?: Date | number | null;
  provider: string;
  providerAccountId: string;
}

export const UserPreferenceSchema = z
  .object({
    defaultOpenInApp: z.string().optional(),
    defaultAgentId: z.string().min(1).max(128).nullish(),
    orchestratorAgentId: z.string().min(1).max(128).nullish(),
    fontFamily: z.string().optional(),
    guide: UserGuideSchema.optional(),
    hideSyncAlert: z.boolean().optional(),
    lastWorkspaceId: z.string().nullish(),
    sidebarHiddenAgentIds: z.array(z.string()).optional(),
    sidebarHiddenGroupIds: z.array(z.string()).optional(),
    showInCollaboration: z.boolean().optional(),
    terminalFontFamily: z.string().optional(),
    telemetry: z.boolean().nullable(),
    topicGroupMode: z.enum(['byTime', 'byProject', 'flat', 'byStatus']).optional(),
    topicIncludeCompleted: z.boolean().optional(),
    topicSortBy: z.enum(['createdAt', 'updatedAt']).optional(),
    useCmdEnterToSend: z.boolean().optional(),
  })
  .partial();
