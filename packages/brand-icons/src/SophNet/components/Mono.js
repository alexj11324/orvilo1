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
            d: 'M2 3.124A3.125 3.125 0 015.126 0h15.101a3.125 3.125 0 010 6.249H5.125A3.125 3.125 0 012 3.124z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M3.293 1.035a3.125 3.125 0 014.411.257l8.51 9.562a3.125 3.125 0 01-4.669 4.155L3.036 5.447a3.125 3.125 0 01.257-4.412z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M2 13.018a3.125 3.125 0 013.125-3.124h8.853a3.124 3.124 0 110 6.248H5.125A3.125 3.125 0 012 13.018z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M8.249 20.829A3.125 3.125 0 112 20.922a3.125 3.125 0 016.249-.093z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
