# Settings → Provider UI

The Settings → Provider page (`src/features/Settings/ProviderBindings/`) renders personal provider bindings
(`provider_bindings` table, `useProviderBindingStore`) in the lobehub provider-settings layout:

- One collapsible `FormGroup` card per catalog provider (`packages/model-bank` `ModelProviderCard`, icons via
  `@lobehub/icons`): chevron, `ProviderCombine` wordmark, truncated description, help link, binding-count tag,
  enable switch. Enabled providers sort first.
- Expanding a card lists saved bindings (`BindingRow`: name · model, check / edit / delete), an "Add binding"
  dashed row, and `BindingEditor` — a horizontal `FormItem` editor: name, credential reference (`InputPassword`
  - "Manage credentials" link), endpoint prefilled from the catalog `settings.proxyUrl.placeholder`, model ID,
    and an "Advanced options" disclosure for the `selection` selects (runtime/engine/effort/mode/speed/target).
- Toggling a provider's switch off opens a confirm modal that removes all its bindings.
- Loading state renders `Skeleton` rows inline in each card while `useFetchProviderBindings` / the catalog
  hook resolves.

Data layer is unchanged: saves go through `providerBindingActions.save` (revision CAS server-side), deletes
through `.remove`, and "check" calls the real `providerBinding.checkConnection` mutation (broker-issued
provider request; `PROVIDER_CHECK_UNAVAILABLE` when no usable credential exists).

Visual reference for the layout: the provider settings implementation retired in `f1846bc1f` (P30),
recoverable via `git show f1846bc1f^:src/features/Settings/provider/...`.
