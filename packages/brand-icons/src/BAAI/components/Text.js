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
          viewBox: '0 0 97 24',
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
            d: 'M15.49 2H2v4.616h11.597a1.539 1.539 0 010 3.076H2v4.616h11.597a1.54 1.54 0 010 3.076H2V22h13.49a6.151 6.151 0 004.802-10A6.154 6.154 0 0015.49 2zM95.362 2h-6.965v20h6.965V2zM73.42 2h-6.966l-8.562 20h6.963l5.086-11.876L75.026 22h6.965L73.427 2h-.008zM43.706 2h-6.965l-8.564 20h6.965l5.085-11.876L45.313 22h6.965L43.713 2h-.007z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
