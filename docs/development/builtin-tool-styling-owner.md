# Builtin tool styling owner

Issue #695 aligns the builtin-tool authoring guide and its UI examples with the
React skill after the role-lookup prerequisite in #699. React owns component
selection, styling, layouts and memoization; DESIGN.md owns visual values.
Builtin-tool retains its tool-specific lifecycle, result composition, registry,
streaming and intervention guidance.

The shared examples use native flex layouts, local skeletons, Tailwind role forms
and the existing text-shiny utility. Modal instructions route to the local adapter.
New examples demonstrate the contract rather than claiming to be literal copies of
legacy source files still being migrated. Retained rich-code components are subject
to the React component inventory, not a blanket recommendation for legacy controls.

The broader skill scan found historical UX audit examples and a prototype sandbox.
Historical examples do not instruct new imports. The prototype's runtime createStyles
exception remains: its Babel-in-browser sandbox has no static extraction build step.
Its introduction now explicitly routes production promotion to React; listed legacy
runtime exports are capabilities rather than application authoring requirements.

Documentation/instruction changes only: no product behavior changes and no Electron
verification required. Validate Markdown and relative links, run normal hooks, and
perform one independent light review before merge.
