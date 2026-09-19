import { SettingsTabs } from '@/store/global/initialState';

/**
 * Settings-surface capability registry — the single answer to "is this settings
 * tab part of the product, and where does a direct visit land?".
 *
 * The navigation registry ([`./index.ts`](./index.ts)) classifies destinations;
 * this one classifies the tabs *inside* one destination. They live together
 * because a retired product surface usually has to be withdrawn in both places
 * in the same edit — the nav entry and the page it opens.
 *
 * Why it exists: the settings sidebar (`useCategory`) and the settings page
 * renderer (`SettingsContent`) used to answer that question in two different
 * places. The sidebar decided which rows to show, while the renderer mapped
 * *every* tab in `componentMap` to a component and silently substituted
 * Appearance for anything it did not recognise. Typing `/settings/<tab>` could
 * therefore open a page the sidebar had already withdrawn — mounting its
 * component and running its queries on the way.
 */

/**
 * How a settings surface exists in the product.
 *
 * - `enabled` — a first-class settings page: it has its own entry, renders its
 *   own component, and may run its own queries.
 * - `task-scoped` — the surface only exists as part of a parent object, so it
 *   must never render standalone; a direct visit is re-homed onto its owner.
 *   No `SettingsTabs` member is task-scoped today. The status exists because
 *   retirement is decided once for the whole product (see
 *   `docs/development/hidden-surface-retirement.md`), and a tab that is folded
 *   into a parent surface has to be able to say so instead of staying `enabled`
 *   with no entry.
 * - `retired` — the surface has been withdrawn. It keeps its place in the
 *   registry because persisted deep links, stored tab state and the Electron
 *   tab lists still carry the id, so it must resolve to something honest
 *   instead of rendering a page the product no longer ships.
 */
export type SettingsCapabilityStatus = 'enabled' | 'retired' | 'task-scoped';

/**
 * Everything a capability decision is allowed to depend on. Passed in rather
 * than read from a store so the decisions stay pure and testable, and so the
 * same registry can answer for a deployment, a platform and a user.
 */
export interface SettingsCapabilityContext {
  /** The deployment ships the business (subscription / usage / billing) pages. */
  enableBusinessFeatures: boolean;
  /** This deployment hides its documentation surface. */
  hideDocs: boolean;
  /** Running inside Electron. */
  isDesktop: boolean;
  /** The user turned on developer mode. */
  isDevMode: boolean;
  /** Rendering the mobile shell. */
  mobile: boolean;
  /** This deployment serves the hosted API-key manager. */
  showApiKeyManage: boolean;
}

export type SettingsCapabilityGate = (context: SettingsCapabilityContext) => boolean;

export interface SettingsCapability {
  /**
   * Legacy destination of a withdrawn tab: a direct visit moves here instead of
   * rendering. A withdrawn tab without one has no live equivalent, so its URL
   * is an honest not-found.
   *
   * This is the compatibility handler, kept apart from `gate`: a `retired` tab
   * is never "still enabled but hidden", it simply never renders.
   */
  aliasOf?: SettingsTabs;
  /**
   * Whether this deployment and platform serve the surface at all. A closed
   * gate means a direct visit must not mount the page — the sidebar's opinion
   * is a consequence of this, never its cause.
   */
  gate?: SettingsCapabilityGate;
  /**
   * Whether the settings navigation offers a row for it. Defaults to `gate`.
   *
   * `offered` may be narrower than `gate` on purpose: a deployment can serve a
   * page it chooses not to advertise. It must never be *wider*, because
   * offering a row that will not render sends the user to a not-found — the
   * invariant `settings.test.ts` pins.
   */
  offered?: SettingsCapabilityGate;
  status: SettingsCapabilityStatus;
}

/**
 * The registry. Every `SettingsTabs` member appears exactly once —
 * `capabilities.test.ts` fails if a tab is added to the enum without landing
 * here, which is what stops the sidebar and the renderer drifting apart again.
 */
export const SETTINGS_CAPABILITIES: Readonly<Record<SettingsTabs, SettingsCapability>> = {
  // ── Withdrawn surfaces ───────────────────────────────────────────────────
  // The user LLM provider / service-model surface was retired in place. These
  // ids stay in `SettingsTabs` because stored URLs and persisted tab state
  // still reference them, and `getSettingsCapability` must keep resolving them
  // to a safe target instead of throwing.
  [SettingsTabs.Agent]: { aliasOf: SettingsTabs.Profile, status: 'retired' },
  [SettingsTabs.ChatAppearance]: { aliasOf: SettingsTabs.Appearance, status: 'retired' },
  [SettingsTabs.Common]: { aliasOf: SettingsTabs.Appearance, status: 'retired' },
  [SettingsTabs.Image]: { aliasOf: SettingsTabs.Profile, status: 'retired' },
  // `llm` was the old provider page and has no live equivalent at all. It used
  // to fall through to Appearance; it must not, so it deliberately names no
  // alias and answers not-found.
  [SettingsTabs.LLM]: { status: 'retired' },
  [SettingsTabs.Provider]: { aliasOf: SettingsTabs.Profile, status: 'retired' },
  [SettingsTabs.ServiceModel]: { aliasOf: SettingsTabs.Profile, status: 'retired' },
  [SettingsTabs.TTS]: { aliasOf: SettingsTabs.Profile, status: 'retired' },

  // ── Live surfaces ────────────────────────────────────────────────────────
  // Settings that follow the user everywhere.
  [SettingsTabs.Profile]: { status: 'enabled' },
  [SettingsTabs.Appearance]: { status: 'enabled' },
  // Hotkeys are a desktop concept; the mobile shell has nothing to bind.
  [SettingsTabs.Hotkey]: { gate: ({ mobile }) => !mobile, status: 'enabled' },

  [SettingsTabs.Messenger]: { status: 'enabled' },
  // Desktop notifications are a local capability, so the row is offered on
  // Electron regardless of whether the deployment ships the business pages
  // that host the rest of the notification settings.
  [SettingsTabs.Notification]: {
    offered: ({ enableBusinessFeatures, isDesktop }) => enableBusinessFeatures || isDesktop,
    status: 'enabled',
  },

  [SettingsTabs.Memory]: { status: 'enabled' },
  // Electron-only: both pages configure the desktop runtime, and neither has
  // anything to configure in a browser.
  [SettingsTabs.Proxy]: { gate: ({ isDesktop }) => isDesktop, status: 'enabled' },
  [SettingsTabs.SystemTools]: { gate: ({ isDesktop }) => isDesktop, status: 'enabled' },

  // The platform's own skill marketplace / management chain was retired as a
  // product. Nothing survives to alias onto: the Connector page manages
  // connections, not agent skills, so a stored `/settings/skill` is an honest
  // dead end rather than a redirect to a page that never owned this.
  [SettingsTabs.Skill]: { status: 'retired' },
  [SettingsTabs.Connector]: { status: 'enabled' },
  [SettingsTabs.Labels]: { status: 'enabled' },
  // The user-built OAuth application console was retired. First-party clients
  // (`orvilo-cli`, desktop, mobile, market) come from the provider's static
  // `defaultClients`, and login / GitHub / Linear / device auth never went
  // through this router.
  [SettingsTabs.OAuthApps]: { status: 'retired' },

  [SettingsTabs.Stats]: { status: 'enabled' },
  [SettingsTabs.Usage]: {
    gate: ({ enableBusinessFeatures }) => enableBusinessFeatures,
    status: 'enabled',
  },
  [SettingsTabs.Plans]: {
    gate: ({ enableBusinessFeatures }) => enableBusinessFeatures,
    status: 'enabled',
  },
  [SettingsTabs.Credits]: {
    gate: ({ enableBusinessFeatures }) => enableBusinessFeatures,
    status: 'enabled',
  },
  [SettingsTabs.Billing]: {
    gate: ({ enableBusinessFeatures }) => enableBusinessFeatures,
    status: 'enabled',
  },
  // The Referral *settings page* was an empty shell at every layer; the
  // referral capability itself lives in `ReferralProvider`, which is untouched.
  // With no page to render there is nothing for the business flag to gate.
  [SettingsTabs.Referral]: { status: 'retired' },

  [SettingsTabs.Creds]: { status: 'enabled' },
  // Hosted key management is a deployment capability, so the row is offered
  // only where the server actually serves it — but the page itself stays
  // reachable wherever it is linked (command palette, error recovery), which
  // is why `offered` is narrower than `gate` here rather than equal to it.
  [SettingsTabs.APIKey]: {
    offered: ({ isDevMode, showApiKeyManage }) => showApiKeyManage || isDevMode,
    status: 'enabled',
  },
  [SettingsTabs.Security]: { status: 'enabled' },

  [SettingsTabs.Storage]: { status: 'enabled' },
  [SettingsTabs.Devices]: { status: 'enabled' },

  [SettingsTabs.Advanced]: { status: 'enabled' },
  [SettingsTabs.Labs]: { status: 'enabled' },
  // `hideDocs` withholds the *documentation* surface. The About page also
  // carries version, update channel and diagnostics, and `/apps` (retired)
  // still redirects into it, so the page stays enabled and only its nav row
  // follows the flag.
  [SettingsTabs.About]: { offered: ({ hideDocs }) => !hideDocs, status: 'enabled' },
};

/**
 * Resolution status of a direct visit: the capability's own status, plus the
 * two answers the registry itself has to give.
 *
 * - `unavailable` — a known tab whose gate is closed in this context.
 * - `unknown` — not a settings tab at all.
 */
export type SettingsCapabilityResolutionStatus =
  SettingsCapabilityStatus | 'unavailable' | 'unknown';

export interface SettingsCapabilityResolution {
  /** Legacy destination: a direct visit moves there and renders nothing. */
  redirectTo?: SettingsTabs;
  status: SettingsCapabilityResolutionStatus;
}

const CAPABILITIES_BY_TAB: Record<string, SettingsCapability> = SETTINGS_CAPABILITIES;

export const getSettingsCapability = (tab: string): SettingsCapability | undefined =>
  CAPABILITIES_BY_TAB[tab];

/**
 * What a direct visit to `/settings/<tab>` should do. Callers must render a
 * not-found for anything but `enabled` — never another tab's component.
 */
export const resolveSettingsCapability = (
  tab: string,
  context: SettingsCapabilityContext,
): SettingsCapabilityResolution => {
  const capability = getSettingsCapability(tab);
  if (!capability) return { status: 'unknown' };

  if (capability.status !== 'enabled') {
    return capability.aliasOf
      ? { redirectTo: capability.aliasOf, status: capability.status }
      : { status: capability.status };
  }

  if (capability.gate && !capability.gate(context)) return { status: 'unavailable' };

  return { status: 'enabled' };
};

/** Whether the tab may render its own page for this context. */
export const isSettingsTabAvailable = (tab: string, context: SettingsCapabilityContext): boolean =>
  resolveSettingsCapability(tab, context).status === 'enabled';

/** Whether the settings navigation may offer a row for this tab. */
export const isSettingsTabOffered = (tab: string, context: SettingsCapabilityContext): boolean => {
  const capability = getSettingsCapability(tab);
  if (!capability || capability.status !== 'enabled') return false;

  const gate = capability.offered ?? capability.gate;
  return gate ? gate(context) : true;
};

/**
 * Legacy `/:workspaceSlug/settings/<alias>` deep links that stay redirects.
 *
 * The workspace settings subtree is its own surface with its own tab list
 * (`WorkspaceSettingsTabs`), so it cannot reuse the personal aliases above:
 * `/acme/settings/stats` is the legacy spelling of a live workspace tab, while
 * `/settings/stats` is a live personal tab. Both routers that register the
 * workspace subtree derive these routes from here rather than keeping their own
 * copy, which is how `/acme/settings/service-model` and
 * `/acme/settings/provider/*` used to be spelled out twice.
 */
export interface WorkspaceSettingsAlias {
  /** Legacy path segment under `/:workspaceSlug/settings/`. */
  alias: string;
  /** Keep `<alias>/:sub` deep links too. */
  subPaths?: boolean;
  /** Live workspace tab to land on, or `root` for the workspace settings index. */
  target: string | 'root';
}

export const WORKSPACE_SETTINGS_ALIASES: readonly WorkspaceSettingsAlias[] = [
  { alias: 'creds', target: 'credential' },
  // `provider` and `service-model` are here because their capability *moved* —
  // the provider surface folded into the workspace settings root, so the old
  // URL has an honest successor to land on.
  //
  // The skill marketplace and the OAuth-app console are deliberately absent:
  // nothing succeeded them. A redirect to the settings root would imply the
  // capability still exists somewhere, so their URLs stay unprefixed and answer
  // the same not-found the personal sidebar answers (see
  // `SettingsTabs.Skill` / `SettingsTabs.OAuthApps` in `SETTINGS_CAPABILITIES`).
  { alias: 'provider', subPaths: true, target: 'root' },
  { alias: 'service-model', target: 'root' },
  { alias: 'stats', target: 'statistics' },
];
