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
            d: 'M7.242 1.613A1.11 1.11 0 018.295.857h6.977L8.03 22.316a1.11 1.11 0 01-1.052.755h-5.43a1.11 1.11 0 01-1.053-1.466L7.242 1.613z',
            fill: a.fill,
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M18.397 15.296H7.4a.51.51 0 00-.347.882l7.066 6.595c.206.192.477.298.758.298h6.226l-2.706-7.775z',
            fill: '#0078D4',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M15.272.857H7.497L0 23.071h7.775l1.596-4.73 5.068 4.73h6.665l-2.707-7.775h-7.998L15.272.857z',
            fill: b.fill,
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M17.193 1.613a1.11 1.11 0 00-1.052-.756h-7.81.035c.477 0 .9.304 1.052.756l6.748 19.992a1.11 1.11 0 01-1.052 1.466h-.12 7.895a1.11 1.11 0 001.052-1.466L17.193 1.613z',
            fill: c.fill,
          }),
          /*#__PURE__*/ _jsxs('defs', {
            children: [
              /*#__PURE__*/ _jsxs('linearGradient', {
                gradientUnits: 'userSpaceOnUse',
                id: a.id,
                x1: '8.247',
                x2: '1.002',
                y1: '1.626',
                y2: '23.03',
                children: [
                  /*#__PURE__*/ _jsx('stop', {
                    stopColor: '#114A8B',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '1',
                    stopColor: '#0669BC',
                  }),
                ],
              }),
              /*#__PURE__*/ _jsxs('linearGradient', {
                gradientUnits: 'userSpaceOnUse',
                id: b.id,
                x1: '14.042',
                x2: '12.324',
                y1: '15.302',
                y2: '15.888',
                children: [
                  /*#__PURE__*/ _jsx('stop', {
                    stopOpacity: '.3',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.071',
                    stopOpacity: '.2',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.321',
                    stopOpacity: '.1',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.623',
                    stopOpacity: '.05',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '1',
                    stopOpacity: '0',
                  }),
                ],
              }),
              /*#__PURE__*/ _jsxs('linearGradient', {
                gradientUnits: 'userSpaceOnUse',
                id: c.id,
                x1: '12.841',
                x2: '20.793',
                y1: '1.626',
                y2: '22.814',
                children: [
                  /*#__PURE__*/ _jsx('stop', {
                    stopColor: '#3CCBF4',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '1',
                    stopColor: '#2892DF',
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
