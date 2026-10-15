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
            d: 'M15.902 14.836l3.93 6.914h-7.934L7.93 14.836h7.972z',
            fill,
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M19.828 21.754l3.96-6.918L15.86 1H7.93l11.898 20.754z',
            fill: '#FF414C',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M3.965 7.914h7.93L3.969 21.75 0 14.836l3.965-6.922z',
            fill: '#FF414C',
          }),
          /*#__PURE__*/ _jsx('defs', {
            children: /*#__PURE__*/ _jsxs('linearGradient', {
              gradientUnits: 'userSpaceOnUse',
              id,
              x1: '13.877',
              x2: '18.518',
              y1: '19.997',
              y2: '14.799',
              children: [
                /*#__PURE__*/ _jsx('stop', {
                  stopColor: '#FF414C',
                }),
                /*#__PURE__*/ _jsx('stop', {
                  offset: '1',
                  stopColor: '#FF414C',
                  stopOpacity: '0',
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
