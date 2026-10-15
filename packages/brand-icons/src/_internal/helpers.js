// Local modernization of the MIT-licensed Babel helpers retained with the brand artwork.
// A fresh factory preserves the original per-module lazy typeof cache.
export function createBrandHelpers() {
  let typeofImplementation;

  function _typeof(value) {
    if (typeofImplementation === undefined) {
      typeofImplementation =
        typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol'
          ? function nativeTypeof(input) {
              return typeof input;
            }
          : function compatibleTypeof(input) {
              return input &&
                typeof Symbol === 'function' &&
                input.constructor === Symbol &&
                input !== Symbol.prototype
                ? 'symbol'
                : typeof input;
            };
    }
    return typeofImplementation(value);
  }

  function ownKeys(source, onlyEnumerable) {
    const keys = Object.keys(source);
    if (Object.getOwnPropertySymbols) {
      let symbols = Object.getOwnPropertySymbols(source);
      if (onlyEnumerable) {
        symbols = symbols.filter(function enumerable(symbol) {
          return Object.getOwnPropertyDescriptor(source, symbol).enumerable;
        });
      }
      keys.push.apply(keys, symbols);
    }
    return keys;
  }

  function _toPrimitive(value, hint) {
    if (_typeof(value) !== 'object' || !value) return value;
    const method = value[Symbol.toPrimitive];
    if (method !== undefined) {
      const primitive = method.call(value, hint || 'default');
      if (_typeof(primitive) !== 'object') return primitive;
      throw new TypeError('@@toPrimitive must return a primitive value.');
    }
    return (hint === 'string' ? String : Number)(value);
  }

  function _toPropertyKey(value) {
    const primitive = _toPrimitive(value, 'string');
    return _typeof(primitive) === 'symbol' ? primitive : String(primitive);
  }

  function _defineProperty(target, key, value) {
    key = _toPropertyKey(key);
    if (key in target) {
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
    } else {
      target[key] = value;
    }
    return target;
  }

  function _objectSpread(target) {
    for (let argument = 1; argument < arguments.length; argument += 1) {
      const source = arguments[argument] != null ? arguments[argument] : {};
      if (argument % 2) {
        ownKeys(new Object(source), true).forEach(function copyValue(key) {
          _defineProperty(target, key, source[key]);
        });
      } else if (Object.getOwnPropertyDescriptors) {
        Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
      } else {
        ownKeys(new Object(source)).forEach(function copyDescriptor(key) {
          Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
        });
      }
    }
    return target;
  }

  function _objectWithoutPropertiesLoose(source, excluded) {
    if (source == null) return {};
    const target = {};
    const keys = Object.keys(source);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (excluded.includes(key)) continue;
      target[key] = source[key];
    }
    return target;
  }

  function _objectWithoutProperties(source, excluded) {
    if (source == null) return {};
    const target = _objectWithoutPropertiesLoose(source, excluded);
    if (Object.getOwnPropertySymbols) {
      const keys = Object.getOwnPropertySymbols(source);
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (excluded.includes(key)) continue;
        if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
        target[key] = source[key];
      }
    }
    return target;
  }

  function _objectDestructuringEmpty(value) {
    if (value == null) throw new TypeError('Cannot destructure ' + value);
  }

  function _arrayLikeToArray(array, length) {
    if (length == null || length > array.length) length = array.length;
    const result = [];
    if (typeof length === 'number') {
      // Native length assignment keeps Array's invalid numeric-length RangeError.
      result.length = length;
    } else {
      // new Array(non-number) originally starts with one element, then the loop writes it.
      result.push(length);
    }
    for (let index = 0; index < length; index += 1) result[index] = array[index];
    return result;
  }

  function _unsupportedIterableToArray(value, minimumLength) {
    if (!value) return;
    if (typeof value === 'string') return _arrayLikeToArray(value, minimumLength);
    let name = Object.prototype.toString.call(value).slice(8, -1);
    if (name === 'Object' && value.constructor) name = value.constructor.name;
    if (name === 'Map' || name === 'Set') return Array.from(value);
    if (name === 'Arguments' || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(name)) {
      return _arrayLikeToArray(value, minimumLength);
    }
  }

  function _iterableToArrayLimit(value, limit) {
    let method =
      value == null
        ? null
        : (typeof Symbol !== 'undefined' && value[Symbol.iterator]) || value['@@iterator'];
    if (method == null) return;
    const values = [];
    let iterator;
    let next;
    let completed = true;
    let originalFailure = false;
    let originalError;
    let earlyReturn = false;
    try {
      iterator = method.call(value);
      next = iterator.next;
      if (limit === 0) {
        if (Object(iterator) !== iterator) earlyReturn = true;
        else completed = false;
      } else {
        while (true) {
          const step = next.call(iterator);
          completed = step.done;
          if (completed) break;
          values.push(step.value);
          if (values.length === limit) break;
          completed = true;
        }
      }
    } catch (error) {
      originalFailure = true;
      originalError = error;
    }
    let closeFailure = false;
    let closeError;
    let invalidCloseResult = false;
    try {
      if (!completed && iterator.return != null) {
        const result = iterator.return();
        invalidCloseResult = Object(result) !== result;
      }
    } catch (error) {
      closeFailure = true;
      closeError = error;
    }
    // Babel's nested finally prioritizes the original iteration error over close failures.
    if (originalFailure) throw originalError;
    if (closeFailure) throw closeError;
    if (earlyReturn || invalidCloseResult) return;
    return values;
  }

  function _arrayWithHoles(value) {
    if (Array.isArray(value)) return value;
  }

  function _nonIterableRest() {
    throw new TypeError(
      'Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.',
    );
  }

  function _slicedToArray(array, limit) {
    return (
      _arrayWithHoles(array) ||
      _iterableToArrayLimit(array, limit) ||
      _unsupportedIterableToArray(array, limit) ||
      _nonIterableRest()
    );
  }

  function _createForOfIteratorHelper(value, allowArrayLike) {
    let iterator = (typeof Symbol !== 'undefined' && value[Symbol.iterator]) || value['@@iterator'];
    if (!iterator) {
      if (
        Array.isArray(value) ||
        (iterator = _unsupportedIterableToArray(value)) ||
        (allowArrayLike && value && typeof value.length === 'number')
      ) {
        if (iterator) value = iterator;
        let index = 0;
        const noop = function noop() {};
        return {
          e(error) {
            throw error;
          },
          f: noop,
          n() {
            if (index >= value.length) return { done: true };
            return { done: false, value: value[index++] };
          },
          s: noop,
        };
      }
      throw new TypeError(
        'Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.',
      );
    }
    let completed = true;
    let originalFailure = false;
    let originalError;
    return {
      e(error) {
        originalFailure = true;
        originalError = error;
      },
      f() {
        let closeFailure = false;
        let closeError;
        try {
          if (!completed && iterator.return != null) iterator.return();
        } catch (error) {
          closeFailure = true;
          closeError = error;
        }
        if (originalFailure) throw originalError;
        if (closeFailure) throw closeError;
      },
      n() {
        const step = iterator.next();
        completed = step.done;
        return step;
      },
      s() {
        iterator = iterator.call(value);
      },
    };
  }

  return {
    _arrayLikeToArray,
    _arrayWithHoles,
    _createForOfIteratorHelper,
    _defineProperty,
    _iterableToArrayLimit,
    _nonIterableRest,
    _objectDestructuringEmpty,
    _objectSpread,
    _objectWithoutProperties,
    _objectWithoutPropertiesLoose,
    _slicedToArray,
    _toPrimitive,
    _toPropertyKey,
    _typeof,
    _unsupportedIterableToArray,
    ownKeys,
  };
}
