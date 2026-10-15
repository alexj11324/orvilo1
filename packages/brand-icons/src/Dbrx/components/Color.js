'use client';

import { memo } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';

import { createBrandHelpers } from '../../_internal/helpers.js';
import { TITLE } from '../style';

const { _objectSpread, _objectWithoutProperties } = createBrandHelpers();

const _excluded = ['size', 'style'];
const Icon = /*#__PURE__*/ memo(function (_ref) {
  var _ref$size = _ref.size,
    size = _ref$size === void 0 ? '1em' : _ref$size,
    style = _ref.style,
    rest = _objectWithoutProperties(_ref, _excluded);
  return /*#__PURE__*/ _jsxs(
    'svg',
    _objectSpread(
      _objectSpread(
        {
          height: size,
          style: _objectSpread(
            {
              flex: 'none',
              lineHeight: 1,
            },
            style,
          ),
          viewBox: '0 0 24 24',
          width: size,
          xmlns: 'http://www.w3.org/2000/svg',
        },
        rest,
      ),
      {},
      {
        children: [
          /*#__PURE__*/ _jsx('title', {
            children: TITLE,
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M21.821 9.894l-9.81 5.595L1.505 9.511 1 9.787v4.34l11.01 6.256 9.811-5.574v2.297l-9.81 5.596-10.506-5.979L1 17v.745L12.01 24 23 17.745v-4.34l-.505-.277-10.484 5.957-9.832-5.574v-2.298l9.832 5.574L23 10.532V6.255l-.547-.319-10.442 5.936-9.327-5.276 9.327-5.298 7.663 4.362.673-.383v-.532L12.011 0 1 6.255v.681l11.01 6.255 9.811-5.595z',
            fill: '#EE3D2C',
            fillRule: 'nonzero',
          }),
        ],
      },
    ),
  );
});
export default Icon;
