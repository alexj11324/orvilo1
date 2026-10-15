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
            d: 'M16.4 21.016h3.667V24h-4.61l-1.99-2.025v-4.689H16.4v3.73zm6.6 0h-2.933v-3.73H16.4v-2.984h4.61L23 16.327v4.689zm-12.467-4.35H7.6v-2.984h2.933v2.984zM1 13.682h2.933v6.714h6.6v2.984H2.99L1 21.355v-7.673zm22-5.968v2.984h-9.533V7.714h3.278v-3.73h-3.278V1h4.22l1.991 2.025v4.689H23zM3.933 4.357H7.6l2.933 2.984v3.357H7.6V7.341H3.933v3.357H1V1h2.933v3.357zm6.6 0H7.6V1h2.933v3.357z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
