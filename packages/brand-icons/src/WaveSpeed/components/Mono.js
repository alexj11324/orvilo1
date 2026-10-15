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
            d: 'm8.038 11.729 2.58-4.469a2.4 2.4 0 0 1 2.074-1.197h2.586c.409 0 .741.332.741.741v4.925l2.58-4.469a2.4 2.4 0 0 1 2.074-1.197h2.586c.409 0 .741.332.741.741v4.219a.74.74 0 0 1-.741.741h-.677l-3.038 5.26a1.823 1.823 0 0 1-2.491.668l-2.217-1.279a1.83 1.83 0 0 1-.912-1.58v-1.897l-2.36 4.088a1.824 1.824 0 0 1-2.492.668l-2.217-1.279a1.83 1.83 0 0 1-.912-1.58v-1.897l-.907 1.571a.74.74 0 0 1-1.012.271L.371 12.669a.74.74 0 0 1-.272-1.013L2.637 7.26a2.4 2.4 0 0 1 2.074-1.197h2.586c.409 0 .741.332.741.741z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
