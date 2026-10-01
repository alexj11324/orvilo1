/**
 * z-index for floating overlay surfaces (popover, menu, select, tooltip).
 *
 * The legacy lobehub base-ui stack assigns floating overlays from 1100 and
 * modals from 1200, stepping +10 per acquired layer. The local
 * `@/components/Modal` stack reproduces that modal tier with backdrop z-1200
 * and popup z-1201 (see src/components/Modal/atoms.tsx). These primitives must
 * paint above an imperative modal that spawned them (e.g. a confirm-modal
 * form opening a select), so they sit above the modal tier base with room
 * for nested layers — below the toast tier (100000).
 */
export const POPUP_Z_CLASS = 'z-[1300]';
