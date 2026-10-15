'use client';

import { memo } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';

import { createBrandHelpers } from '../../_internal/helpers.js';
import { useFillIds } from '../../hooks/useFillId';
import { TITLE } from '../style';

const { _objectSpread, _objectWithoutProperties, _slicedToArray } = createBrandHelpers();

const _excluded = ['size', 'style'];
const Icon = /*#__PURE__*/ memo(function (_ref) {
  var _ref$size = _ref.size,
    size = _ref$size === void 0 ? '1em' : _ref$size,
    style = _ref.style,
    rest = _objectWithoutProperties(_ref, _excluded);
  var _useFillIds = useFillIds(TITLE, 2),
    _useFillIds2 = _slicedToArray(_useFillIds, 2),
    a = _useFillIds2[0],
    b = _useFillIds2[1];
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
            d: 'M12 0l10.392 6v12L12 24 1.608 18V6L12 0z',
            fill: a.fill,
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M12 3.934l6.985 4.033v8.066L12 20.065l-6.985-4.032V7.967L12 3.934z',
            fill: b.fill,
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M12 6.885l4.43 2.558v1.377h-2.386L12 9.64l-2.044 1.18v2.36L12 14.36l2.044-1.18h2.386v1.377L12 17.115l-4.43-2.558V9.443L12 6.885z',
            fill: '#fff',
            fillRule: 'evenodd',
          }),
          /*#__PURE__*/ _jsxs('defs', {
            children: [
              /*#__PURE__*/ _jsxs('linearGradient', {
                gradientUnits: 'userSpaceOnUse',
                id: a.id,
                x1: '12',
                x2: '12',
                y1: '0',
                y2: '24',
                children: [
                  /*#__PURE__*/ _jsx('stop', {
                    stopColor: '#1281F4',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '1',
                    stopColor: '#0821C6',
                  }),
                ],
              }),
              /*#__PURE__*/ _jsxs('linearGradient', {
                gradientUnits: 'userSpaceOnUse',
                id: b.id,
                x1: '12',
                x2: '12',
                y1: '3.934',
                y2: '20.066',
                children: [
                  /*#__PURE__*/ _jsx('stop', {
                    stopColor: '#09138A',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '1',
                    stopColor: '#150740',
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    ),
  );
});
export default Icon;
