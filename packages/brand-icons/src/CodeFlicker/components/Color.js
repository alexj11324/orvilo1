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
            d: 'M4.707 6.24V3.5H0v16.977h4.707v-2.74H2.94V6.24h1.766z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M20.868 3.5h-1.575v2.74h1.775v11.497h-1.775v2.74H24V3.5h-3.132zM13.22 3.5l-.55 3.082H9.623l.541-3.082h3.057zM14.395 8.398l-2.133 12.08H9.213l2.125-12.08h3.057z',
            fill: '#32EDDA',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M14.395 8.398l-2.133 12.08h7.031v-2.741h1.775V8.398h-6.673z',
            fill: a.fill,
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M9.622 6.583l1.716 1.816h3.057l-1.724-1.816H9.62z',
            fill: b.fill,
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M13.22 3.5h6.073v2.74h1.775v2.158h-6.673L12.67 6.582l.55-3.082z',
            fill: c.fill,
          }),
          /*#__PURE__*/ _jsxs('defs', {
            children: [
              /*#__PURE__*/ _jsxs('linearGradient', {
                gradientUnits: 'userSpaceOnUse',
                id: a.id,
                x1: '10.505',
                x2: '20.36',
                y1: '13.772',
                y2: '14.838',
                children: [
                  /*#__PURE__*/ _jsx('stop', {
                    stopColor: '#32EDDA',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.09',
                    stopColor: '#48EEDD',
                    stopOpacity: '.89',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.43',
                    stopColor: '#95F5EB',
                    stopOpacity: '.51',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.7',
                    stopColor: '#CEFAF6',
                    stopOpacity: '.24',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.9',
                    stopColor: '#F1FDFC',
                    stopOpacity: '.07',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '1',
                    stopColor: '#fff',
                    stopOpacity: '0',
                  }),
                ],
              }),
              /*#__PURE__*/ _jsxs('linearGradient', {
                gradientUnits: 'userSpaceOnUse',
                id: b.id,
                x1: '11.854',
                x2: '12.321',
                y1: '6.258',
                y2: '9.998',
                children: [
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.01',
                    stopColor: '#32EDDA',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.06',
                    stopColor: '#4CEFDE',
                    stopOpacity: '.87',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.15',
                    stopColor: '#76F2E6',
                    stopOpacity: '.67',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.25',
                    stopColor: '#9AF6EC',
                    stopOpacity: '.49',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.35',
                    stopColor: '#B9F8F2',
                    stopOpacity: '.34',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.45',
                    stopColor: '#D3FBF7',
                    stopOpacity: '.21',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.56',
                    stopColor: '#E6FCFA',
                    stopOpacity: '.12',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.68',
                    stopColor: '#F4FEFD',
                    stopOpacity: '.05',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.82',
                    stopColor: '#FCFEFE',
                    stopOpacity: '.01',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '1',
                    stopColor: '#fff',
                    stopOpacity: '0',
                  }),
                ],
              }),
              /*#__PURE__*/ _jsxs('linearGradient', {
                gradientUnits: 'userSpaceOnUse',
                id: c.id,
                x1: '13.112',
                x2: '20.41',
                y1: '2.9',
                y2: '8.873',
                children: [
                  /*#__PURE__*/ _jsx('stop', {
                    stopColor: '#32EDDA',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.1',
                    stopColor: '#5BF0E1',
                    stopOpacity: '.8',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.23',
                    stopColor: '#86F4E9',
                    stopOpacity: '.59',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.35',
                    stopColor: '#ABF7EF',
                    stopOpacity: '.41',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.48',
                    stopColor: '#C9FAF5',
                    stopOpacity: '.26',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.6',
                    stopColor: '#E1FCF9',
                    stopOpacity: '.15',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.73',
                    stopColor: '#F1FDFC',
                    stopOpacity: '.06',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.86',
                    stopColor: '#FBFEFE',
                    stopOpacity: '.02',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '1',
                    stopColor: '#fff',
                    stopOpacity: '0',
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
