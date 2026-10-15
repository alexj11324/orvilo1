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
    fill = _useFillId.fill,
    id = _useFillId.id;
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
            d: 'M0 4.391A4.391 4.391 0 014.391 0h15.217A4.391 4.391 0 0124 4.391v15.217A4.391 4.391 0 0119.608 24H4.391A4.391 4.391 0 010 19.608V4.391z',
            fill,
          }),
          /*#__PURE__*/ _jsx('path', {
            clipRule: 'evenodd',
            d: 'M19.74 1.444a2.816 2.816 0 012.816 2.816v15.48a2.816 2.816 0 01-2.816 2.816H4.26a2.816 2.816 0 01-2.816-2.816V4.26A2.816 2.816 0 014.26 1.444h15.48zM7.236 8.564l7.752 3.728-7.752 3.727v2.802l9.557-4.596v-3.866L7.236 5.763v2.801z',
            fill: '#1E1E2E',
            fillRule: 'evenodd',
          }),
          /*#__PURE__*/ _jsx('defs', {
            children: /*#__PURE__*/ _jsxs('linearGradient', {
              gradientUnits: 'userSpaceOnUse',
              id,
              x1: '24',
              x2: '0',
              y1: '6.587',
              y2: '16.494',
              children: [
                /*#__PURE__*/ _jsx('stop', {
                  stopColor: '#EE4D5D',
                }),
                /*#__PURE__*/ _jsx('stop', {
                  offset: '.328',
                  stopColor: '#B381DD',
                }),
                /*#__PURE__*/ _jsx('stop', {
                  offset: '.476',
                  stopColor: '#207CFE',
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
