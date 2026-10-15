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
            d: 'M9.686 11.976a6297.72 6297.72 0 00-.006-5.112.353.353 0 00-.355-.35H2.279A.28.28 0 012 6.234V2.226c0-.06.023-.117.065-.16A.22.22 0 012.222 2h11.665a.274.274 0 01.273.262c.14 3.141.023 6.296.026 9.762l.008 5.11a.353.353 0 00.353.352h7.046a.28.28 0 01.279.28v4.009a.227.227 0 01-.137.208.22.22 0 01-.085.017H9.985a.273.273 0 01-.273-.262c-.14-3.141-.02-6.296-.026-9.762zM21.619 2.041l-3.896-.02a.282.282 0 00-.283.28l-.02 3.902c-.002.156.124.282.28.283l3.895.02a.282.282 0 00.284-.28l.02-3.901a.282.282 0 00-.28-.284zM6.166 17.518H2.31a.299.299 0 00-.299.299v3.855c0 .166.134.3.3.3h3.855a.299.299 0 00.3-.3v-3.855a.299.299 0 00-.3-.3z',
            fill: '#4334F5',
          }),
        ],
      },
    ),
  );
});
export default Icon;
