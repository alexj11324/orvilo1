import type { McpEventFilter } from '@orvilo/types';
import { isRecord } from '@orvilo/utils/object';

export type { McpEventFilter } from '@orvilo/types';

export function validMcpEventFilters(filters: McpEventFilter[]): boolean {
  return (
    Array.isArray(filters) &&
    filters.length <= 20 &&
    filters.every(
      (filter) =>
        Array.isArray(filter.path) &&
        filter.path.length > 0 &&
        filter.path.length <= 10 &&
        filter.path.every(
          (key) =>
            typeof key === 'string' &&
            key.length > 0 &&
            key.length <= 128 &&
            !['__proto__', 'constructor', 'prototype'].includes(key),
        ) &&
        ['equals', 'contains'].includes(filter.operator) &&
        (filter.value === null ||
          ['string', 'boolean'].includes(typeof filter.value) ||
          (typeof filter.value === 'number' && Number.isFinite(filter.value))) &&
        (filter.operator !== 'contains' || typeof filter.value === 'string'),
    )
  );
}

/** No regex, eval, coercion or inherited property access in subscription filters. */
export function matchesMcpEventFilters(
  data: Record<string, unknown>,
  filters: McpEventFilter[],
): boolean {
  if (!validMcpEventFilters(filters)) return false;
  return filters.every((filter) => {
    let value: unknown = data;
    for (const key of filter.path) {
      if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, key)) return false;
      value = value[key];
    }
    return filter.operator === 'equals'
      ? value === filter.value
      : typeof value === 'string' &&
          typeof filter.value === 'string' &&
          value.includes(filter.value);
  });
}
