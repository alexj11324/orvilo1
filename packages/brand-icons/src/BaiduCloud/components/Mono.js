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
            d: 'M21.715 5.61l-3.983 2.31a.903.903 0 01-.896 0L12.44 5.384a.903.903 0 00-.897 0L7.156 7.92a.903.903 0 01-.896 0L2.276 5.617 12.002 0l9.713 5.61z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M18.641 9.467a.89.89 0 00-.438.77v5.072a.896.896 0 01-.445.77l-4.428 2.51a.884.884 0 00-.445.777v4.607l4.429-2.536 5.31-3.047V7.157l-3.983 2.31z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M10.98 18.941a.936.936 0 00-.305-.352l-4.429-2.516a.903.903 0 01-.431-.764v-5.078a.89.89 0 00-.452-.757l-.451-.26L1.38 7.158V18.39l5.311 3.047L11.126 24v-4.608a.881.881 0 00-.146-.45z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
