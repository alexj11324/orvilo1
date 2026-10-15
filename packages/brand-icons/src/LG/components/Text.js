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
          fillRule: 'nonzero',
          height: size,
          style: _objectSpread(
            {
              flex: 'none',
              lineHeight: 1,
            },
            style,
          ),
          viewBox: '0 0 65 24',
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
            d: 'M6.422 17.93h9.17v3.783H2V2.287h4.422V17.93zm18.9-3.623h3.6v3.398c-.661.256-1.957.512-3.188.512-3.982 0-5.308-2.05-5.308-6.217 0-3.976 1.262-6.317 5.241-6.317 2.218 0 3.477.706 4.52 2.054l2.754-2.569C31.26 2.737 28.325 2 25.57 2c-6.192 0-9.444 3.427-9.444 9.966C16.125 18.473 19.06 22 25.54 22c2.972 0 5.878-.768 7.459-1.891v-9.426h-7.68l.002 3.624zM39 22l6.437-20h4.753l6.437 20H52.39l-2.852-10.418a102.698 102.698 0 01-.896-3.24 72.439 72.439 0 00-.869-3.292h-.109a88.125 88.125 0 01-.842 3.293c-.29 1.115-.58 2.195-.869 3.239L43.074 22H39zm3.993-5.128v-3.104h9.56v3.104h-9.56zM58.98 22V2H63v20h-4.02z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
