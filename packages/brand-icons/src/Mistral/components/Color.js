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
            d: 'M3.428 3.4h3.429v3.428H3.428V3.4zm13.714 0h3.43v3.428h-3.43V3.4z',
            fill: 'gold',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M3.428 6.828h6.857v3.429H3.429V6.828zm10.286 0h6.857v3.429h-6.857V6.828z',
            fill: '#FFAF00',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M3.428 10.258h17.144v3.428H3.428v-3.428z',
            fill: '#FF8205',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M3.428 13.686h3.429v3.428H3.428v-3.428zm6.858 0h3.429v3.428h-3.429v-3.428zm6.856 0h3.43v3.428h-3.43v-3.428z',
            fill: '#FA500F',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M0 17.114h10.286v3.429H0v-3.429zm13.714 0H24v3.429H13.714v-3.429z',
            fill: '#E10500',
          }),
        ],
      },
    ),
  );
});
export default Icon;
