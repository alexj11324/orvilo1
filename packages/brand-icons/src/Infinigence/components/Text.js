'use client';

import { memo } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';

import { createBrandHelpers } from '../../_internal/helpers.js';
import { TITLE } from '../style';

const { _objectSpread, _objectWithoutProperties } = createBrandHelpers();

const _excluded = ['size', 'style'];
const Icon = /*#__PURE__*/ memo(function (_ref) {
  var _ref$size = _ref.size,
    size = _ref$size === void 0 ? '1em' : _ref$size,
    style = _ref.style,
    rest = _objectWithoutProperties(_ref, _excluded);
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
          viewBox: '0 0 148 24',
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
            d: 'M25.692 7.667v7.584L19.8 7.667h-3.711V22h3.935v-7.87L26.141 22h3.486V7.666h-3.935zM43.635 11.153V7.666H32.196L32.156 22h3.975v-5.118h6.77V13.58h-6.77v-2.426h7.504zM45.53 7.667V22h3.997V7.666h-3.996zM61.76 7.667v7.584l-5.892-7.584h-3.71V22h3.934v-7.87L62.21 22h3.487V7.666H61.76zM68.326 7.667V22h3.996V7.666h-3.996zM112.774 7.667v7.584l-5.892-7.584h-3.711V22h3.935v-7.87l6.117 7.87h3.487V7.666h-3.936zM10.42 18.228V3.874H2v3.792h3.874v10.562H2V22h12.294v-3.772h-3.873zM87.308 13.518V22H74.952V7.666H87.37v3.263h-9.154v7.789h5.81v-2.651H81.66v-2.549h5.648zM131.532 10.929V7.666h-11.825V22h11.805v-3.282h-8.543v-7.79h8.563z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M14.294 0h-3.873v3.874h3.873V0z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M138.139 18.615v-2.263h6.891v-3.14h-6.891v-2.16h7.604V7.666h-11.56V22h11.662v-3.385h-7.706zM93.405 18.615v-2.263h6.891v-3.14h-6.891v-2.16h7.605V7.666H89.45V22h11.662v-3.385h-7.707z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
