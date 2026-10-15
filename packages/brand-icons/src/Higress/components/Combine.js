'use client';

import { memo } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';

import { createBrandHelpers } from '../../_internal/helpers.js';
import Mono from './Text';
import Color from './TextColor';

const { _objectSpread, _objectWithoutProperties } = createBrandHelpers();

const _excluded = ['type'];
const Combine = /*#__PURE__*/ memo(function (_ref) {
  var _ref$type = _ref.type,
    type = _ref$type === void 0 ? 'mono' : _ref$type,
    rest = _objectWithoutProperties(_ref, _excluded);
  return type === 'color'
    ? /*#__PURE__*/ _jsx(Color, _objectSpread({}, rest))
    : /*#__PURE__*/ _jsx(Mono, _objectSpread({}, rest));
});
export default Combine;
