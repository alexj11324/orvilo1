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
            d: 'M20.2,18.01L12,0.47,3.8,18.01l-2.58,5.52c1.62,-1.05,3.39,-1.86,5.26,-2.41,1.76,-0.51,3.61,-0.79,5.52,-0.79,0.98,0,1.95,0.08,2.9,0.22l-1.86,-4.3c-0.53,-0.1,-2.87,-0.1,-4.59,0.3l3.56,-8.28,5.52,12.85c0.01,0,0.02,0.01,0.03,0.01,1.86,0.55,3.62,1.36,5.23,2.4l-2.58,-5.52Z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
