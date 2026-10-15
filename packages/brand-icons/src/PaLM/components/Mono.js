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
            d: 'M12 22.926c.928 0 1.679-.752 1.679-1.68V6.696h-3.358v14.552c0 .927.751 1.679 1.679 1.679z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M18.69 12.005A5.819 5.819 0 0012 10.904l7.188 7.188c.296.296.807.179.933-.22a5.815 5.815 0 00-1.431-5.867z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M5.31 12.005A5.819 5.819 0 0112 10.904l-7.188 7.188a.562.562 0 01-.933-.22 5.815 5.815 0 011.431-5.867z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M18.157 6.426c-2.86 0-5.288 1.875-6.157 4.478h11.367a.629.629 0 00.565-.908c-1.08-2.12-3.26-3.57-5.775-3.57z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M13.188 3.384c-2.023 2.024-2.414 5.064-1.188 7.52l8.038-8.039a.629.629 0 00-.242-1.042c-2.264-.735-4.83-.217-6.608 1.561z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M10.812 3.384c2.023 2.024 2.414 5.064 1.188 7.52L3.962 2.865a.629.629 0 01.242-1.042c2.264-.735 4.83-.217 6.608 1.561z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M5.843 6.426c2.86 0 5.288 1.875 6.157 4.478H.633a.629.629 0 01-.565-.908c1.08-2.12 3.26-3.57 5.775-3.57z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
