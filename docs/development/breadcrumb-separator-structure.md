# Breadcrumb separator structure

`BreadcrumbSeparator` and `BreadcrumbItem` both render an `<li>`, so a separator must be a sibling of the item inside `BreadcrumbList`, never its child. The task breadcrumb in `src/features/AgentTasks/shared/Breadcrumb.tsx` wraps each separator and item pair in a keyed `Fragment` to keep the list markup valid. `Breadcrumb.test.tsx` guards this by asserting that no `li` is nested in another `li` and that every separator is a direct child of the `ol`.
