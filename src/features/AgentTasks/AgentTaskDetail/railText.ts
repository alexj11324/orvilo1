/**
 * Linear's issue rail runs its property values one step under the page body:
 * 13px at medium weight, in every state (editable, disabled, running).
 * The lobehub `Text` default is 14, so every rail row's value passes this
 * size explicitly instead of inheriting the body step.
 */
export const RAIL_VALUE_FONT_SIZE = 13;
