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
  var _useFillIds = useFillIds(TITLE, 4),
    _useFillIds2 = _slicedToArray(_useFillIds, 4),
    a = _useFillIds2[0],
    b = _useFillIds2[1],
    c = _useFillIds2[2],
    d = _useFillIds2[3];
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
            d: 'M5.412 13.775A23.193 23.193 0 017.41 9.32c3.17-5.492 7.795-8.757 10.33-7.294C12.038-1.266 4.598.944 1.122 6.964A13.378 13.378 0 00.085 9.22c-.259.739.092 1.534.77 1.926l4.557 2.63z',
            fill: a.fill,
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M18.588 10.164a23.188 23.188 0 01-1.999 4.455c-3.17 5.492-7.795 8.758-10.33 7.294 5.703 3.293 13.143 1.082 16.619-4.938a13.392 13.392 0 001.037-2.255c.259-.738-.092-1.534-.77-1.925l-4.557-2.63z',
            fill: b.fill,
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M16.59 14.62c3.17-5.492 3.686-11.13 1.15-12.594C15.207.563 10.582 3.83 7.41 9.32c2.074-3.59 5.809-5.315 8.344-3.852 2.534 1.464 2.908 5.56.835 9.151z',
            fill: c.fill,
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M7.41 9.32c-3.17 5.492-3.686 11.13-1.15 12.593 2.534 1.464 7.159-1.802 10.33-7.294-2.074 3.591-5.809 5.316-8.344 3.852-2.534-1.463-2.908-5.56-.835-9.15z',
            fill: d.fill,
          }),
          /*#__PURE__*/ _jsxs('defs', {
            children: [
              /*#__PURE__*/ _jsxs('radialGradient', {
                cx: '0',
                cy: '0',
                gradientTransform: 'matrix(7.47772 -12.51022 17.14368 10.24728 5.173 13.637)',
                gradientUnits: 'userSpaceOnUse',
                id: a.id,
                r: '1',
                children: [
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.095',
                    stopColor: '#FFF959',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.326',
                    stopColor: '#0DF35E',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.64',
                    stopColor: '#0BF2F9',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '1',
                    stopColor: '#04A6F0',
                  }),
                ],
              }),
              /*#__PURE__*/ _jsxs('radialGradient', {
                cx: '0',
                cy: '0',
                gradientTransform: 'rotate(120.868 6.491 10.491) scale(14.5747 19.9728)',
                gradientUnits: 'userSpaceOnUse',
                id: b.id,
                r: '1',
                children: [
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.095',
                    stopColor: '#FFF959',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.326',
                    stopColor: '#0DF35E',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '.64',
                    stopColor: '#0BF2F9',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '1',
                    stopColor: '#04A6F0',
                  }),
                ],
              }),
              /*#__PURE__*/ _jsxs('linearGradient', {
                gradientUnits: 'userSpaceOnUse',
                id: c.id,
                x1: '15.578',
                x2: '18.062',
                y1: '1.798',
                y2: '9.861',
                children: [
                  /*#__PURE__*/ _jsx('stop', {
                    stopColor: '#003EFF',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '1',
                    stopColor: '#0BFFE7',
                  }),
                ],
              }),
              /*#__PURE__*/ _jsxs('linearGradient', {
                gradientUnits: 'userSpaceOnUse',
                id: d.id,
                x1: '8.422',
                x2: '5.938',
                y1: '22.142',
                y2: '14.079',
                children: [
                  /*#__PURE__*/ _jsx('stop', {
                    stopColor: '#003EFF',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '1',
                    stopColor: '#0BFFE7',
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
