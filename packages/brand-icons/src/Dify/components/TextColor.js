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
          viewBox: '0 0 53 24',
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
            d: 'M23.834 5.851c1.403 0 1.924-.86 1.924-1.925S25.24 2 23.834 2c-1.405 0-1.923.861-1.923 1.926 0 1.064.518 1.925 1.923 1.925z',
            fill: '#03F',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M7.837 2.002H2v17.874h5.837c7.209 0 9.269-4.124 9.269-8.938 0-4.814-2.06-8.936-9.27-8.936zm.069 15.125h-2.61V4.752h2.61c4.146 0 5.906 2.037 5.906 6.186s-1.76 6.186-5.906 6.186v.003z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M30.563 6.265v1.239h-3.157v2.75h3.157v6.875h-5.22V7.501H18.48v2.75h3.844v6.876H17.79v2.749h20.597v-2.75h-4.805v-6.875h4.805V7.5h-4.805v-2.75h4.805V2.003h-3.571a4.266 4.266 0 00-4.258 4.263h.005z',
            fill: '#03F',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M48.177 7.501L45.43 16.44l-2.746-8.938h-3.262l3.983 11.561c.414 1.203-.288 2.189-1.56 2.189h-1.394V24h2.052c1.79 0 3.4-1.134 4.005-2.819l4.93-13.68h-3.262z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
