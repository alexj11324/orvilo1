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
            d: 'M4.914 5.18c3.32-3.762 9.095-4.247 12.91-1.13l.362.312.252.232A9.4 9.4 0 0121.02 8.93 6.778 6.778 0 0124 14.597c-.028 3.744-3.087 6.726-6.83 6.697H6.739a6.746 6.746 0 01-3.869-1.222l-.224-.162-.302-.247a6.778 6.778 0 01.54-10.673l-.004.001a9.644 9.644 0 012.034-3.812zm10.345 2.11c-2.143-1.734-5.282-1.46-7.138.578l-.026.025a6.77 6.77 0 014.045 2.523l-3.023 3.023a2.606 2.606 0 10-2.379 3.682h10.43c1.44 0 2.607-1.137 2.607-2.576a2.607 2.607 0 00-2.606-2.607v-.52a5.205 5.205 0 00-1.685-3.933l-.225-.195z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
