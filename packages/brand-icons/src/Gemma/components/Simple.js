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
          height: size,
          style: _objectSpread(
            {
              flex: 'none',
              lineHeight: 1,
            },
            style,
          ),
          viewBox: '0 0 24 24',
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
            d: 'M12 0a14.305 14.305 0 0 0 12 12 14.305 14.305 0 0 0-12 12A14.304 14.304 0 0 0 0 12 14.304 14.304 0 0 0 12 0Zm.031 4.5A14.281 14.281 0 0 1 9 9a14.742 14.742 0 0 1-4.5 3.063 14.281 14.281 0 0 1 4.5 3.03 14.281 14.281 0 0 1 3.031 4.5 14.742 14.742 0 0 1 3.063-4.5 14.281 14.281 0 0 1 4.5-3.03A14.742 14.742 0 0 1 15.094 9a14.74 14.74 0 0 1-3.063-4.5Z',
            fillRule: 'evenodd',
          }),
        ],
      },
    ),
  );
});
export default Icon;
