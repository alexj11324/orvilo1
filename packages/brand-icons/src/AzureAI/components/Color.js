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
  var _useFillIds = useFillIds(TITLE, 3),
    _useFillIds2 = _slicedToArray(_useFillIds, 3),
    a = _useFillIds2[0],
    b = _useFillIds2[1],
    c = _useFillIds2[2];
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
            clipRule: 'evenodd',
            d: 'M16.233 0c.713 0 1.345.551 1.572 1.329.227.778 1.555 5.59 1.555 5.59v9.562h-4.813L14.645 0h1.588z',
            fill: a.fill,
            fillRule: 'evenodd',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M23.298 7.47c0-.34-.275-.6-.6-.6h-2.835a3.617 3.617 0 00-3.614 3.615v5.996h3.436a3.617 3.617 0 003.613-3.614V7.47z',
            fill: b.fill,
          }),
          /*#__PURE__*/ _jsx('path', {
            clipRule: 'evenodd',
            d: 'M16.233 0a.982.982 0 00-.989.989l-.097 18.198A4.814 4.814 0 0110.334 24H1.6a.597.597 0 01-.567-.794l7-19.981A4.819 4.819 0 0112.57 0h3.679-.016z',
            fill: c.fill,
            fillRule: 'evenodd',
          }),
          /*#__PURE__*/ _jsxs('defs', {
            children: [
              /*#__PURE__*/ _jsxs('linearGradient', {
                gradientUnits: 'userSpaceOnUse',
                id: a.id,
                x1: '18.242',
                x2: '14.191',
                y1: '16.837',
                y2: '.616',
                children: [
                  /*#__PURE__*/ _jsx('stop', {
                    stopColor: '#712575',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.09',
                    stopColor: '#9A2884',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.18',
                    stopColor: '#BF2C92',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.27',
                    stopColor: '#DA2E9C',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.34',
                    stopColor: '#EB30A2',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.4',
                    stopColor: '#F131A5',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.5',
                    stopColor: '#EC30A3',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.61',
                    stopColor: '#DF2F9E',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.72',
                    stopColor: '#C92D96',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.83',
                    stopColor: '#AA2A8A',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.95',
                    stopColor: '#83267C',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '1',
                    stopColor: '#712575',
                  }),
                ],
              }),
              /*#__PURE__*/ _jsxs('linearGradient', {
                gradientUnits: 'userSpaceOnUse',
                id: b.id,
                x1: '19.782',
                x2: '19.782',
                y1: '.34',
                y2: '23.222',
                children: [
                  /*#__PURE__*/ _jsx('stop', {
                    stopColor: '#DA7ED0',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.08',
                    stopColor: '#B17BD5',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.19',
                    stopColor: '#8778DB',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.3',
                    stopColor: '#6276E1',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.41',
                    stopColor: '#4574E5',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.54',
                    stopColor: '#2E72E8',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.67',
                    stopColor: '#1D71EB',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.81',
                    stopColor: '#1471EC',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '1',
                    stopColor: '#1171ED',
                  }),
                ],
              }),
              /*#__PURE__*/ _jsxs('linearGradient', {
                gradientUnits: 'userSpaceOnUse',
                id: c.id,
                x1: '18.404',
                x2: '3.236',
                y1: '.859',
                y2: '25.183',
                children: [
                  /*#__PURE__*/ _jsx('stop', {
                    stopColor: '#DA7ED0',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.05',
                    stopColor: '#B77BD4',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.11',
                    stopColor: '#9079DA',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.18',
                    stopColor: '#6E77DF',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.25',
                    stopColor: '#5175E3',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.33',
                    stopColor: '#3973E7',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.42',
                    stopColor: '#2772E9',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.54',
                    stopColor: '#1A71EB',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.68',
                    stopColor: '#1371EC',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '1',
                    stopColor: '#1171ED',
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
