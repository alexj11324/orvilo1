'use client';

import { memo } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';

import { createBrandHelpers } from '../../_internal/helpers.js';
import { useFillId } from '../../hooks/useFillId';
import { TITLE } from '../style';

const { _objectSpread, _objectWithoutProperties } = createBrandHelpers();

const _excluded = ['size', 'style'];
const Icon = /*#__PURE__*/ memo(function (_ref) {
  var _ref$size = _ref.size,
    size = _ref$size === void 0 ? '1em' : _ref$size,
    style = _ref.style,
    rest = _objectWithoutProperties(_ref, _excluded);
  var _useFillId = useFillId(TITLE),
    fill = _useFillId.fill,
    id = _useFillId.id;
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
            d: 'M3.429 10.75c0 2.32.903 4.546 2.51 6.187A8.484 8.484 0 0012 19.5a8.484 8.484 0 006.06-2.563 8.843 8.843 0 002.511-6.187H24c0 3.249-1.264 6.365-3.515 8.662A11.877 11.877 0 0112 23c-3.183 0-6.235-1.29-8.485-3.588A12.38 12.38 0 010 10.75h3.429zm13.714 0a5.306 5.306 0 01-1.507 3.712A5.09 5.09 0 0112 16a5.09 5.09 0 01-3.637-1.538 5.306 5.306 0 01-1.506-3.712h10.286zM12 2c2.273 0 4.453.922 6.06 2.563a8.843 8.843 0 012.511 6.187h-3.428a5.306 5.306 0 00-1.507-3.712A5.09 5.09 0 0012 5.5a5.09 5.09 0 00-3.637 1.538 5.306 5.306 0 00-1.506 3.712H3.43c0-2.32.903-4.546 2.51-6.187A8.484 8.484 0 0112 2z',
            fill,
          }),
          /*#__PURE__*/ _jsx('defs', {
            children: /*#__PURE__*/ _jsxs('radialGradient', {
              cx: '0',
              cy: '0',
              gradientTransform: 'matrix(21.6991 27.0254 -47.9838 40.1491 2.3 -4.025)',
              gradientUnits: 'userSpaceOnUse',
              id,
              r: '1',
              children: [
                /*#__PURE__*/ _jsx('stop', {
                  stopColor: '#6A46AC',
                }),
                /*#__PURE__*/ _jsx('stop', {
                  offset: '.63',
                  stopColor: '#31008C',
                }),
              ],
            }),
          }),
        ],
      },
    ),
  );
});
export default Icon;
