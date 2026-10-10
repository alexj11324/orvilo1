# Resource manager list and toolbar presentation

Ten ResourceManager files remove direct antd-style imports. List drop zones,
headers, select-all hints, source filter pills, masonry toolbar/hint and hierarchy
skeleton containers use Tailwind. Inline variable references in list skeletons,
the chunk drawer divider and toolbar icons retain their exact theme roles.

Column sizing overrides, logical insets, sticky offsets and skeleton geometry
remain. Source-filter hover explicitly retains the former unlayered text color
and selected fill; its existing small-button line height remains text-xs.
Description, icon, split, primary drag-fill/outline and small-radius variables
remain exact until shared theme migration.

Selection, filtering, pagination, dragging and chunk-drawer behavior are untouched.
Masonry file-card hover badges and nested item styles remain separate work due to
their retained parent selectors and focus-shadow cascade. No important modifiers
or global layer switches are introduced.

Scoped checks and independent review are recorded on the PR. 未做真机验证；no
visual parity or Electron acceptance is claimed. No source-string tests added.
