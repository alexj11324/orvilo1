# Native responsive selection for Acceptance

Continues #577 by replacing antd-style useResponsive in five Acceptance consumers with the existing native useIsMobile from hooks/use-mobile. No new hook or dependency is introduced. Drawer, evidence list and reject modal remove their final antd-style imports; check-row and flow styles remain for separate batches.

These five consumers all previously read md with a true fallback. The existing hook's initial false mobile value preserves the desktop server/initial-render choice, and its 768px threshold matches the current uncustomized antd md threshold. The existing native hook now subscribes in a layout effect, matching the previous observer’s pre-paint initialization. This shared one-line change also applies to existing sidebar/date-selector consumers; the existing sidebar tests are run separately from the scoped check (they mock the hook and do not establish effect timing). Listener cleanup and desktop server fallback remain unchanged.

JavaScript remains necessary because these paths choose mounted content and behavior: desktop/mobile evidence review, paired versus actionable evidence, drawer header/close visibility, row actions and default graph/outline selection. Existing CSS breakpoints, state owners, data, handlers and markup branches are unchanged. Overview's different false fallback and lg-based consumers are deliberately outside this batch.

Validation: scoped lint/related tests, focused native-hook breakpoint and resize checks, normal hooks and one independent light review. 未做真机验证；no Electron/mobile runtime or visual parity claimed.
