# Provider Settings Redesign

Implements the approved "Option A, keep two columns" design for `src/features/Settings/provider/**`.
The mockup is the visual spec; it is not committed. Preview: <https://orvilo-provider-settings-mockup.vercel.app>
(use the "Option A" list and detail screens, both themes; the grey toolbar is not part of the design).

The work ships as three stacked PRs, one concern each:

1. `refactor/provider-settings-list`: left provider rail, card grid, page title.
2. `refactor/provider-settings-detail`: detail header and the credentials panel.
3. `refactor/provider-settings-models`: the models panel.

Out of scope for all three (the mockup does not draw them): the add-provider, add-model, model-config and
sort dialogs, `ModelSwitchPanel`, and the OAuth device-flow dialog. Mobile layout (`_layout/Mobile.tsx`) is unchanged.

## Mockup tokens to repo tokens

Do not copy hex values from the mockup. Map by role:

| Mockup        | Repo                                                            |
| ------------- | --------------------------------------------------------------- |
| `--layout`    | `bg-background`                                                 |
| `--container` | `bg-card`                                                       |
| `--hover`     | `bg-accent`                                                     |
| `--selected`  | `bg-selected`                                                   |
| `--text-2`    | `text-muted-foreground`                                         |
| `--border-2`  | `border-border`                                                 |
| status        | `@/components/reui/badge` `*-light` variants, `bg-success` dots |
| radius        | panels and cards 8px (`--radius-card`), inputs 6px, badges 4px  |

## PR 1: list

- Rail: 264px wide, `@/components/SearchBar` + icon `Button` (32px), `NavItem` rows (unchanged component),
  three groups (enabled, custom, disabled) with counts. Groups still collapse (existing behaviour); the chevron
  appears on hover or focus. The sort button, the disabled-group "more" menu and the right-click menu use the
  same items array through `SidebarDropdownMenu` / local `ContextMenu`.
- Grid: `grid-cols-[repeat(auto-fill,minmax(260px,1fr))]`, 12px gap. Each card is one stretched `button` for
  navigation plus a separate switch; the switch has an accessible name.
- Header: page title (`setting:tab.provider`) and a one-line description (`modelProvider:list.header.desc`).

### Status data

The list payload (`AiProviderListItem`) carries `enabled` only: no credentials and no check result. So the list
shows "Enabled" (success badge) and "Disabled" (neutral badge), and the rail dot is green or absent.
"Not configured" cannot be derived here, and "Connection failed" has no persisted source at all (the connectivity
check result lives in component state and is lost on navigation). Showing either would be invented, so neither is
shown. Model counts are not in the list payload either and are omitted.

### Deviations from the mockup

- Switch size follows the mockup CSS (32x18, the local `default` size), not the 24x14 `sm` the list used before.
- The content column keeps the shared 1024px max width (mockup: 1100px list, 960px detail) because the container
  is shared with the detail page.
- Groups can collapse and the "All providers" row keeps its icon; the mockup draws neither.
