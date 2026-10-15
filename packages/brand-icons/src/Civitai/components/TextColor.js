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
          viewBox: '0 0 110 24',
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
            d: 'M21.594 2H4.234L2 4.437v15.228L4.335 22h17.36v-5.28H7.28V7.38h14.315V2zM77.736 2H57.939v5.38h7.31v14.518h5.279V7.381h7.106L77.737 2zm-53.706.102v19.796h5.28V2.102h-5.28zm7.716 0v19.796h7.716l8.426-8.426V2.102H42.61v8.426l-5.482 6.091V2.102h-5.38zm18.579 0v19.796h5.28V2.102h-5.28z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M102.305 2.102v19.796h5.279V2.102h-5.279zm-4.772 0H82.508l-2.335 2.335v17.462h5.279V14.69h9.035v7.208h5.28V4.438l-2.234-2.335zM94.589 9.31h-9.036V7.38h9.036v1.93zM47.888 16.72v5.178h-5.177',
            fill: '#1970C2',
          }),
        ],
      },
    ),
  );
});
export default Icon;
