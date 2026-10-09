import { formatAbsoluteDateTime } from '@orvilo/utils/time';

/** Page info time as a numeric `YYYY/MM/DD HH:mm`; empty for missing or invalid values. */
export const formatPageEditorInfoTime = (value: Date | string | null | undefined) =>
  formatAbsoluteDateTime(value);
