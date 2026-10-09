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

## PR 2: detail header and credentials

- `ProviderConfig` keeps all form logic (antd form instance, debounced autosave, pre-check save, OAuth state) and
  only changes what it renders: `ProviderHeader` (identity, status badge, description, doc link, builtin notice,
  edit-info button for custom providers, enable switch), then a "Credentials" section.
- `CredentialsPanel` renders any `FormItemProps[]` as `Frame` rows (`FieldRow`: label and description left, control
  right, 60px min height). Rows bind with `Form.Item` the way `GroupForm` does, so every provider page that supplies
  `apiKeyItems` (azure, azureai, bedrock, cloudflare, comfyui, github, vertexai, ...) keeps working unchanged. Antd
  switches go through `FormSwitch` (`valuePropName: 'checked'`).
- `Checker` is a `FieldRow` of its own: result badge, model select (local `Select`, searchable), Check button, and the
  error detail (`CheckErrorRender` slot still used by ollama and unsloth) in a full-width footer.
- The OAuth card is untouched apart from receiving the new identity and actions.

### Status data (detail)

The detail page has what the list lacks: the stored key vault and the live form values. The badge shows
"Enabled" when switched on, "Disabled" when off but an API key, endpoint or OAuth login exists, and "Not configured"
when off and none of those exist. A persisted "connection failed" still has no source: the check result lives in the
`Checker` component state and is lost on navigation. Showing it would need the last check result stored per provider
(for example on the provider config row), which is a backend change and out of scope here.

### Deviations from the mockup (PR 2)

- No "more actions" menu in the header: the only provider-level action is the edit-info button for custom providers,
  which stays as a gear button. There is no other action to put in a menu.
- The credentials section has no "stored only under your account" subtitle. Whether provider keys are per-user or
  per-workspace depends on scope, so the claim is not made. The existing AES-GCM notice stays under the panel.
- The result of a passing check is a badge next to the select; the button keeps its "Check" label.
