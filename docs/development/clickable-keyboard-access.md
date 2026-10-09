# Keyboard access for clickable elements

A `div` or `span` with an `onClick` must be keyboard-operable. Use a real `Button` or link when the element has no other controls inside. When it has to stay a plain element, spread `clickableProps()` from `@/utils/clickableProps` next to the `onClick` and add `CLICKABLE_FOCUS_RING` to its class. That gives it `role="button"`, `tabIndex={0}` and Enter/Space activation, which only fires when the element itself has focus so keys from nested controls keep their meaning.

When the element contains other buttons, checkboxes or links, do not make the whole row a button: put the props on its primary label instead.

The `Menu` adapter's `menuitem` rows follow the same rule.

The check sequence and round chips place keyboard props on the same inner span that owns their click handler. Keyboard activation therefore reaches that handler and its propagation guard. Native regression: open a populated check in Electron and run `node e2e/scripts/assertAcceptanceChipKeyboard.cjs <Electron CDP URL> <check id>`. It checks both Enter and Space against the native clipboard and verifies the row disclosure does not change. The sequence-chip regression failed before the fix (row expanded to collapsed, clipboard unchanged) and passed afterwards on the same local two-round fixture.
