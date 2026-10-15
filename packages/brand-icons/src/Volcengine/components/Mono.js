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
            d: 'M7.29 5.36L3.148 21.737a.215.215 0 00.203.261h8.29a.214.214 0 00.215-.261L7.7 5.359a.214.214 0 00-.41 0z',
            fillOpacity: '.5',
          }),
          /*#__PURE__*/ _jsx('path', {
            clipRule: 'evenodd',
            d: 'M4.553 16.18l-1.406 5.558a.214.214 0 00.203.261h2.42-4.551a.214.214 0 01-.214-.26l2.275-8.961a.214.214 0 01.409 0l.864 3.402z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M14.44.15a.214.214 0 00-.41 0L8.366 21.739a.214.214 0 00.214.261H19.9a.214.214 0 00.215-.261L14.44.151z',
            fillOpacity: '.5',
          }),
          /*#__PURE__*/ _jsx('path', {
            clipRule: 'evenodd',
            d: 'M16.694 22h3.207a.215.215 0 00.214-.262l-1.839-6.993 1.164-4.592a.214.214 0 01.411 0l2.951 11.586a.214.214 0 01-.214.261h-5.894z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M10.278 7.741L6.685 21.736a.214.214 0 00.214.264h7.17a.216.216 0 00.214-.166.216.216 0 000-.098L10.687 7.742a.214.214 0 00-.409 0z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
