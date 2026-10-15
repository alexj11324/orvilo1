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
            d: 'M12 2.568c-6.33 0-9.495 5.275-9.495 9.495 0 4.22 3.165 8.44 6.33 9.494v2.11h2.11v-2.11s1.055.422 2.11 0v2.11h2.11v-2.11c3.165-1.055 6.33-5.274 6.33-9.494S18.33 2.568 12 2.568z',
            fill: a.fill,
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M3.56 9.953C.396 8.898-.66 11.008.396 13.118c1.055 2.11 3.164 1.055 4.22-1.055.632-1.477 0-2.11-1.056-2.11z',
            fill: b.fill,
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M20.44 9.953c3.164-1.055 4.22 1.055 3.164 3.165-1.055 2.11-3.164 1.055-4.22-1.055-.632-1.477 0-2.11 1.056-2.11z',
            fill: c.fill,
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M5.507 1.875c.476-.285 1.036-.233 1.615.037.577.27 1.223.774 1.937 1.488a.316.316 0 01-.447.447c-.693-.693-1.279-1.138-1.757-1.361-.475-.222-.795-.205-1.022-.069a.317.317 0 01-.326-.542zM16.877 1.913c.58-.27 1.14-.323 1.616-.038a.317.317 0 01-.326.542c-.227-.136-.547-.153-1.022.069-.478.223-1.064.668-1.756 1.361a.316.316 0 11-.448-.447c.714-.714 1.36-1.218 1.936-1.487z',
            fill: '#FF4D4D',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M8.835 9.109a1.266 1.266 0 100-2.532 1.266 1.266 0 000 2.532zM15.165 9.109a1.266 1.266 0 100-2.532 1.266 1.266 0 000 2.532z',
            fill: '#050810',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M9.046 8.16a.527.527 0 100-1.056.527.527 0 000 1.055zM15.376 8.16a.527.527 0 100-1.055.527.527 0 000 1.054z',
            fill: '#00E5CC',
          }),
          /*#__PURE__*/ _jsxs('defs', {
            children: [
              /*#__PURE__*/ _jsxs('linearGradient', {
                gradientUnits: 'userSpaceOnUse',
                id: a.id,
                x1: '-.659',
                x2: '27.023',
                y1: '.458',
                y2: '22.855',
                children: [
                  /*#__PURE__*/ _jsx('stop', {
                    stopColor: '#FF4D4D',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '1',
                    stopColor: '#991B1B',
                  }),
                ],
              }),
              /*#__PURE__*/ _jsxs('linearGradient', {
                gradientUnits: 'userSpaceOnUse',
                id: b.id,
                x1: '0',
                x2: '4.311',
                y1: '9.672',
                y2: '14.949',
                children: [
                  /*#__PURE__*/ _jsx('stop', {
                    stopColor: '#FF4D4D',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '1',
                    stopColor: '#991B1B',
                  }),
                ],
              }),
              /*#__PURE__*/ _jsxs('linearGradient', {
                gradientUnits: 'userSpaceOnUse',
                id: c.id,
                x1: '19.385',
                x2: '24.399',
                y1: '9.953',
                y2: '14.462',
                children: [
                  /*#__PURE__*/ _jsx('stop', {
                    stopColor: '#FF4D4D',
                  }),
                  /*#__PURE__*/ _jsx('stop', {
                    offset: '1',
                    stopColor: '#991B1B',
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
