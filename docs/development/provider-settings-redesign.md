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

### Form switch names

Client request mode and Responses API controls pass their existing localized row titles as aria-label to FormSwitch. The CredentialsPanel visual row label is a separate div, so it does not name the embedded switch automatically. The true-parent rebase preserves the current save-error toast and its locale keys. Native computed-name verification remains required before claiming product acceptance.

## PR 3: models panel

- `ModelList` is a section: heading (`ModelTitle`: title, "N enabled", clear-fetched action) above a `Frame` panel
  holding the toolbar (`ModelToolbar`: search, fetch, add, reset menu), the type tabs (local `Tabs`), then the enabled
  and disabled groups as `GroupHeader` rows followed by `ModelItem` rows (44px min height, hover wash).
- `ModelItem` keeps `ModelInfoTags` (abilities and context window), release date and price text, the config / delete
  actions (shown on hover or keyboard focus on desktop, always on mobile) and the confirm-delete dialog. The model
  ID is a `ModelIdChip`: click copies it, the chip shows a check mark for two seconds and the existing toast stays.
- Disabled group keeps the sort menu, load-more via `IntersectionObserver` and the remote paging; the enabled group
  keeps batch disable and the sort dialog; search results keep batch enable.
- Dialogs (add model, model config, sort, reset-all confirm, delete confirm) are untouched and still open through
  their existing imperative helpers.

### Deviations from the mockup (PR 3)

- Rows are not a strict column table: the abilities and context window come from the existing `ModelInfoTags`
  (one control), and price / release date stay as the secondary line under the name, not separate aligned columns.
- The section heading no longer sticks to the top while scrolling (it sat above the page chrome in the old layout).
- The "N enabled" summary shows enabled models only; the total is not known up front because disabled models page in.

## Carried over from canary

Canary changed these files while the redesign was in flight; the behaviour was re-applied to the new markup:

- Card keyboard access and focus ring (`clickableProps`): the card is a real stretched `button`, so it is focusable, activates on Enter and Space, and shows the `Button` focus ring.
- Rail "more" menu: accessible name `common:more` (the tooltip keeps the sort label).
- Edit-info button: accessible name `common:settings`.
- Autosave: a rejected `updateAiProviderConfig` shows an error toast (`providerModels.config.saveFailed`, or the error message) instead of an unhandled rejection.
- Connectivity check busy indicator: the local `Spinner` (the new select uses `loading`).
- Ollama close button name and OAuth card `Spinner` merged unchanged.
- Toolbar buttons: the "more" menu is named `common:more`; the add-model button now has a visible "Add Model" label, which names it (the icon-only `common:addNew` label is no longer needed).
- Model ID copy feedback: `ModelIdChip` keeps the copied toast and adds an inline check mark for two seconds.

## Verification fixes (`fix/provider-settings-verify-findings`)

Defects measured on the real app after the three PRs merged:

- Rail search now also filters the card grid (`features/filterProviders.ts` is the one match rule for both) and the
  grid shows `menu.notFound` when nothing matches. `SearchBar` gets an accessible name (its placeholder), Esc clears a
  non-empty query (same as the settings sidebar search) and the clear button returns focus to the input.
- Status badge: `ProviderConfig/providerStatus.ts` lets the live form value win over the stored one, so clearing the
  key flips the badge to "Not configured" at once instead of waiting for the runtime config to refresh. An invalid
  proxy URL is never persisted (autosave drops it, `isPersistableBaseURL`) and no longer counts as configured.
- Connectivity check without a key or endpoint shows an inline error (`checker.missingCredentials`) instead of
  sending a request.
- Focus rings: info icon and AES-GCM link use the standard 3px ring; the password eye is a local `Button`
  (`icon-sm`, 28px) so it also gets the ring.
- Credentials and models panels set `--frame-radius` to `--radius-card` (8px) locally; the shared `Frame` default
  (`--radius-xl`) is unchanged.
- Model ID chip uses the shared toast (with an error toast when the clipboard write fails) plus the inline check.

Left as is (decisions, see the PR): rail row height and focus ring come from the shared `NavItem`, which the doc
keeps unchanged; the rail keeps one tab stop per row because no list in the app, Plane or Multica uses roving focus.

### Unconfigured provider null credentials

Coordinator Electron acceptance of the original `ee8370929a7a18e889e7d46b1741803ed80c15c4`
provider-status helper hit a real detail-page crash after selecting an unconfigured builtin provider:
the form passed watched fields as an object, while saved `keyVaults` was `null`. A default parameter
of `{}` only covers `undefined`, so reading `stored.baseURL` threw; credential reads had the same gap.

The author repair at `bbd25dedcbcd4e681e780e05732885b3a5d718c0` accepts absent/null live and
stored values and reads their fields optionally. It preserves intentional live clears and the
stored-value fallback for invalid live proxy URLs. Existing-file regressions additionally cover
the observed live-object/stored-null shape in both helpers, valid live values, empty clears, and
an invalid live URL with no stored fallback. Against the original helper these tests fail with
the real `baseURL`/`apiKey` null-read exceptions; with the repaired helper all 14 status tests and
4 existing provider-filter tests pass with one worker.

These are utility tests, not fresh Electron acceptance of the repaired source. The corrected
unconfigured-provider route and complete provider verification remain pending coordinator acceptance.
