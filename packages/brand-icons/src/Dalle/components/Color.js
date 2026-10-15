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
            d: 'M0 10h4.8v5H0z',
            fill: '#FFFF67',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M4.8 10h4.8v5H4.8z',
            fill: '#43FFFF',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M9.6 10h4.8v5H9.6z',
            fill: '#51DA4B',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M14.4 10h4.8v5h-4.8z',
            fill: '#FF6E3D',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M19.2 10H24v5h-4.8z',
            fill: '#3C46FF',
          }),
        ],
      },
    ),
  );
});
export default Icon;
