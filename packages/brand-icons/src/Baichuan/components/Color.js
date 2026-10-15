'use client';

import { memo } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';

import { createBrandHelpers } from '../../_internal/helpers.js';
import { useFillId } from '../../hooks/useFillId';
import { TITLE } from '../style';

const { _objectSpread, _objectWithoutProperties } = createBrandHelpers();

const _excluded = ['size', 'style'];
const Icon = /*#__PURE__*/ memo(function (_ref) {
  var _ref$size = _ref.size,
    size = _ref$size === void 0 ? '1em' : _ref$size,
    style = _ref.style,
    rest = _objectWithoutProperties(_ref, _excluded);
  var _useFillId = useFillId(TITLE),
    id = _useFillId.id,
    fill = _useFillId.fill;
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
          /*#__PURE__*/ _jsx('defs', {
            children: /*#__PURE__*/ _jsxs('linearGradient', {
              id,
              x1: '17.764%',
              x2: '100%',
              y1: '8.678%',
              y2: '91.322%',
              children: [
                /*#__PURE__*/ _jsx('stop', {
                  offset: '0%',
                  stopColor: '#FEC13E',
                }),
                /*#__PURE__*/ _jsx('stop', {
                  offset: '100%',
                  stopColor: '#FF6933',
                }),
              ],
            }),
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M7.333 2h-3.2l-2 4.333V17.8L0 22h5.2l2.028-4.2L7.333 2zm7.334 0h-5.2v20h5.2V2zM16.8 7.733H22V22h-5.2V7.733zM22 2h-5.2v4.133H22V2z',
            fill,
            fillRule: 'nonzero',
          }),
        ],
      },
    ),
  );
});
export default Icon;
