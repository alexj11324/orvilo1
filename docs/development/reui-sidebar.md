# ReUI App Shell 9 sidebar

Only the sidebar composition from [ReUI App Shell 9](https://reui.io/blocks/application/app-shell/app-shell-9) is used. Existing Orvilo main-page layout and content remain in their original containers. The CollectUI registry proxy and base-nova configuration are unchanged.

Orvilo retains its original navigation hierarchy, preferences, workspace entries, favorites, teams and commands. Source9 Sidebar/Menu/Dropdown primitives supply the presentation. Global workspace and Issue navigation stays visible on Agent pages. The workspace/account footer uses the original source component, with actual identity and commands.

The [structure contract](../research/reui/sidebar/STRUCTURE.md) records the 250/66 px geometry and content invariants. macOS Electron sidebar surfaces reveal the existing native frosted material; other platforms retain the source zinc backdrop.

Verification uses populated isolated Electron fixtures and real navigation/menu/page controls. Evidence identifies the delivered revision and is attached to the PR. Local Web startup is blocked by the machine development rule; Web build and Typecheck run in remote CI.

Drafts is deferred by product decision (2026-09-29). It is omitted from primary navigation and the sidebar customizer, and the hidden row no longer fetches draft counts. No Drafts feature work is included in the current ReUI migration; existing routes, storage and unsent content are retained.

On macOS, the upper-left titlebar button is the single sidebar toggle; the midpoint rail is removed. Web and non-Mac desktop use the upper sidebar header toggle. Collapsed sidebar search and account controls show only their icon/avatar.
