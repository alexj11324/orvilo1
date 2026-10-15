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
            d: 'M19.46 1.492L21 3.036V10.5l-1.54 1.51-1.539-1.51V3.036l1.54-1.544zm-7.469 0l1.557 1.544V10.5l-1.557 1.51-1.54-1.51V3.036l1.54-1.544zM4.54 12.01L3 10.499V3.036l1.54-1.544 1.539 1.544V10.5l-1.54 1.51zM3 13.519l1.54-1.51 1.539 1.51v8.971L4.539 24 3 22.49v-8.972zM19.46 24l-1.539-1.51v-8.972l1.54-1.51L21 13.519v8.972L19.46 24zM6.08 0h4.373l1.54 1.492-1.54 1.544H6.079l-1.54-1.544L6.08 0zm7.47 0h4.372l1.54 1.492-1.54 1.544h-4.373l-1.557-1.544L13.548 0z',
            fill: '#FF5C00',
          }),
        ],
      },
    ),
  );
});
export default Icon;
