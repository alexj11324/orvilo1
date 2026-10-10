# Local file tool display styles

Nine local file tool components now use Tailwind utility strings instead of
direct antd-style imports. File/folder opening, relative-path capabilities,
rename/move data and HTML/Markdown/image preview branches are unchanged.

The existing FileItem nested `:hover` compiles to a descendant selector
(`.file-row :hover`), verified with the installed Stylis compiler. The migrated
arbitrary variant preserves that selector rather than changing interaction
semantics. Read-file actions use a named group hover to retain ancestor-hover
visibility without changing markup. Move rows transition their only hover
change, background color, for the original 200ms ease duration.

The retained LobeHub Image root has its own unlayered radius rule. Its public
style prop now carries the exact existing large-radius variable so a layered
utility cannot lose precedence. Other unmapped tertiary/quaternary/description
colors, quaternary fill, radius and motion easing retain existing variables
until shared theme migration. Existing 4px/8px geometry is preserved.

Shared Markdown/Image/icon components and existing anticon compatibility
classes remain separate migration work; this batch does not claim transitive
dependency removal. Scoped check, normal hooks and independent review evidence
are recorded on the PR. No source-string tests for this style conversion.
未做真机验证；no visual-parity or native file-action acceptance claim.
