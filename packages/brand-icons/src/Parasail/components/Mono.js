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
            d: 'M0 15.852c4.5 0 8.147 3.648 8.147 8.148H0v-8.148z',
          }),
          /*#__PURE__*/ _jsx('path', {
            clipRule: 'evenodd',
            d: 'M0 7.688v.018C9 7.706 16.294 15 16.294 24h.019l-.018-.036c3.33-.2 8.864-2.447 7.49-9.58A19.95 19.95 0 009.61.213C2.482-1.155.235 4.374.036 7.704L0 7.688z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
