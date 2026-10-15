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
            d: 'M15.961 7.327l2.086-2.086.14-.879C14.384.905 8.34 1.297 4.913 5.18A9.643 9.643 0 002.88 8.991l.747-.105 4.172-.688.322-.33c1.856-2.038 4.994-2.312 7.137-.578l.703.037z',
            fill: '#EA4335',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M21.02 8.93a9.399 9.399 0 00-2.834-4.568L15.258 7.29a5.204 5.204 0 011.91 4.129v.52a2.606 2.606 0 012.607 2.605c0 1.44-1.167 2.577-2.606 2.577h-5.22l-.512.556v3.126l.513.49h5.219c3.743.03 6.802-2.952 6.83-6.695a6.778 6.778 0 00-2.98-5.668z',
            fill: '#4285F4',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M6.738 21.293h5.212v-4.172H6.738c-.371 0-.731-.08-1.069-.234l-.74.227-2.1 2.086-.183.71a6.763 6.763 0 004.092 1.383z',
            fill: '#34A853',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M6.738 7.759A6.778 6.778 0 002.646 19.91l3.023-3.023a2.606 2.606 0 113.448-3.448l3.023-3.023a6.771 6.771 0 00-5.402-2.657z',
            fill: '#FBBC05',
          }),
        ],
      },
    ),
  );
});
export default Icon;
