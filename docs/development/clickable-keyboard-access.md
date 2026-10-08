# Keyboard access for clickable elements

A `div` or `span` with an `onClick` must be keyboard-operable. Use a real `Button` or link when the element has no other controls inside. When it has to stay a plain element, spread `clickableProps()` from `@/utils/clickableProps` next to the `onClick` and add `CLICKABLE_FOCUS_RING` to its class. That gives it `role="button"`, `tabIndex={0}` and Enter/Space activation, which only fires when the element itself has focus so keys from nested controls keep their meaning.

When the element contains other buttons, checkboxes or links, do not make the whole row a button: put the props on its primary label instead.

The `Menu` adapter's `menuitem` rows follow the same rule.
