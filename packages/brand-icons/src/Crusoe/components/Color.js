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
          /*#__PURE__*/ _jsx('path', {
            d: 'M12 0L4.583 6.583c-3.23 2.869-3.23 7.965 0 10.834L12 24l7.417-6.583c3.23-2.869 3.23-7.965 0-10.834L12 0z',
            fill,
          }),
          /*#__PURE__*/ _jsx('defs', {
            children: /*#__PURE__*/ _jsxs('linearGradient', {
              gradientUnits: 'userSpaceOnUse',
              id,
              x1: '18.919',
              x2: '4.853',
              y1: '5.595',
              y2: '18.301',
              children: [
                /*#__PURE__*/ _jsx('stop', {
                  stopColor: '#F4BF45',
                }),
                /*#__PURE__*/ _jsx('stop', {
                  offset: '.35',
                  stopColor: '#E48047',
                }),
                /*#__PURE__*/ _jsx('stop', {
                  offset: '.69',
                  stopColor: '#C73361',
                }),
                /*#__PURE__*/ _jsx('stop', {
                  offset: '1',
                  stopColor: '#A42F5F',
                }),
              ],
            }),
          }),
        ],
      },
    ),
  );
});
export default Icon;
