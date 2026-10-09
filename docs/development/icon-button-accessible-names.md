# Accessible names and nested interactive elements

Every icon-only control needs an i18n'd accessible name: pass `aria-label` (or a string `title` to `ActionIcon`) from `t()`. Reuse the generic `common` keys (`delete`, `remove`, `close`, `more`, `back`, `previous`, `next`, `refresh`, `settings`, `sort`) before adding a new one. Never ship placeholder or English-only labels, and do not put an `aria-label` on a link that already has visible text.

A link must not wrap a `Button` or `ActionIcon`: that nests two interactive elements. For navigation render the link itself with `buttonVariants()` (`<Link className={buttonVariants({ size, variant })}>`), and use `size: 'icon-xs'` and friends for an icon-only link.
