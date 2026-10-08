import { type FormItemProps } from '@/components/GroupForm';

export interface KvPair {
  key: string;
  value: string;
}

type KvPairRule = NonNullable<FormItemProps['rules']>[number];

/**
 * A row with only one of key/value filled. Submitting it used to drop the row
 * silently, so a cleared value deleted the stored secret without any signal.
 */
export const isHalfFilledPair = (pair?: Partial<KvPair>): boolean =>
  Boolean(pair?.key) !== Boolean(pair?.value);

/** Completed rows as the `{ key: value }` payload; fully empty rows are skipped. */
export const pairsToValues = (pairs: Array<Partial<KvPair>> = []): Record<string, string> =>
  pairs.reduce<Record<string, string>>((acc, { key, value }) => {
    if (key && value) acc[key] = value;
    return acc;
  }, {});

/**
 * Rule for either input of row `index`: fails when the sibling is filled but
 * this one is empty. Pair with `dependencies` on the sibling so the error clears
 * as soon as the row is completed.
 */
export const pairCompletenessRule =
  (index: number, message: string): KvPairRule =>
  ({ getFieldValue }) => ({
    validator: (_, current?: string) =>
      !current && isHalfFilledPair(getFieldValue(['kvPairs', index]))
        ? Promise.reject(new Error(message))
        : Promise.resolve(),
  });
