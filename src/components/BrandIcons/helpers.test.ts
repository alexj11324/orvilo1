import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import { createBrandHelpers } from '../../../packages/brand-icons/src/_internal/helpers.js';
import originalBodies from '../../../packages/brand-icons/src/_internal/original-helper-bodies.json';

const original = vm.runInNewContext(
  `(function () { ${originalBodies.join('\n')} return { _objectSpread, _objectWithoutProperties, _slicedToArray, _createForOfIteratorHelper }; })()`,
  { Array, Object, Symbol, TypeError, String, Number },
);

for (const [label, helpers] of [
  ['original', original],
  ['modern', createBrandHelpers()],
] as const) {
  describe(`brand helper behavior: ${label}`, () => {
    it('copies odd source getters as values and even sources as descriptors, including symbols', () => {
      const symbol = Symbol('visible');
      const hidden = Symbol('hidden');
      let reads = 0;
      const source = Object.defineProperties(
        {},
        {
          value: {
            enumerable: true,
            get: () => {
              reads += 1;
              return 7;
            },
          },
          [symbol]: { enumerable: true, value: 9 },
          [hidden]: { enumerable: false, value: 11 },
        },
      );
      const values = helpers._objectSpread({}, source);
      expect(reads).toBe(1);
      expect(Object.getOwnPropertyDescriptor(values, 'value')?.get).toBeUndefined();
      expect(values[symbol]).toBe(9);
      expect(values[hidden]).toBeUndefined();
      const descriptors = helpers._objectSpread({}, {}, source);
      expect(reads).toBe(1);
      expect(Object.getOwnPropertyDescriptor(descriptors, 'value')?.get).toBeDefined();
      expect(descriptors[hidden]).toBe(11);
    });

    it('object rest excludes selected strings and symbols and retains enumerable symbols', () => {
      const included = Symbol('included');
      const excluded = Symbol('excluded');
      const source = { keep: 1, omit: 2, [included]: 3, [excluded]: 4 };
      expect(helpers._objectWithoutProperties(source, ['omit', excluded])).toEqual({
        keep: 1,
        [included]: 3,
      });
    });

    it('array fast path preserves the same sparse array and strings obey slicing limits', () => {
      const sparse = [1, 2, 3];
      delete sparse[1];
      expect(helpers._slicedToArray(sparse, 1)).toBe(sparse);
      expect(helpers._slicedToArray('abc', 2)).toEqual(['a', 'b']);
    });

    it('closes an iterator at the limit, with two return getter reads', () => {
      let reads = 0;
      let closes = 0;
      const iterator = {
        next: () => ({ done: false, value: 42 }),
        get return() {
          reads += 1;
          return () => {
            closes += 1;
            return {};
          };
        },
      };
      expect(helpers._slicedToArray({ [Symbol.iterator]: () => iterator }, 1)).toEqual([42]);
      expect(reads).toBe(2);
      expect(closes).toBe(1);
    });

    it('preserves original iteration errors when closing also throws', () => {
      const originalError = new Error('original');
      const closeError = new Error('close');
      let count = 0;
      const iterable = {
        [Symbol.iterator]: () => ({
          next: () =>
            ++count === 1
              ? {
                  done: false,
                  get value() {
                    throw originalError;
                  },
                }
              : { done: true },
          return: () => {
            throw closeError;
          },
        }),
      };
      expect(() => helpers._slicedToArray(iterable, 1)).toThrow(originalError);
    });

    it('for-of helper preserves the body error over a close error', () => {
      const originalError = new Error('body');
      const iterable = {
        [Symbol.iterator]: () => ({
          next: () => ({ done: false, value: 1 }),
          return: () => {
            throw new Error('close');
          },
        }),
      };
      const iterator = helpers._createForOfIteratorHelper(iterable);
      iterator.s();
      iterator.n();
      iterator.e(originalError);
      expect(() => iterator.f()).toThrow(originalError);
    });
  });
}
