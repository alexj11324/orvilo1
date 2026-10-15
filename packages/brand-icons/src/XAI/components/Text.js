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
          fill: 'currentColor',
          fillRule: 'evenodd',
          height: size,
          style: _objectSpread(
            {
              flex: 'none',
              lineHeight: 1,
            },
            style,
          ),
          viewBox: '0 0 41 24',
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
            d: 'M36.867 2h2.577v20h-2.577V2zM23.875 2h2.717l7.759 20H31.55l-2.101-5.574h-8.571L18.777 22h-2.69l7.788-20zm4.79 12.185l-3.53-9.272-3.473 9.272h7.003zM7.35 14.381L2.504 7.518h2.857l3.446 5.126 3.585-5.126h2.605l-4.762 6.835L15.501 22h-2.829l-3.977-5.854L4.689 22H2l5.35-7.619z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
