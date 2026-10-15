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
            d: 'M3.723 4.542V24H7.37v-7.893s.007 0 .007.007V15.6c1.249 1.201 2.818 2.034 4.555 2.319.418.062.844.097 1.276.097 4.325-.125 8.07-3.332 8.699-7.733a8.916 8.916 0 00-1.723-6.678A9.017 9.017 0 0014.228.092a9.023 9.023 0 00-6.71 1.715c-.238.173-.46.36-.677.555L4.288.321 2 3.153l1.723 1.389zM13 3.306a5.69 5.69 0 015.392 3.853 5.655 5.655 0 01-3.9 7.275 5.57 5.57 0 01-1.492.194c-.976 0-1.89-.243-2.692-.673a5.519 5.519 0 01-1.863-1.59 5.462 5.462 0 01-1.067-2.568 5.355 5.355 0 01-.063-.826c0-3.131 2.546-5.665 5.685-5.665z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
