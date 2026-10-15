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
            d: 'M8.341 24c-.53 0-.841-.308-.841-.824v-.271c0-.514.248-.755.708-.926l1.025-.343c.708-.271.954-.583.954-1.303V3.667c0-.72-.246-1.029-.954-1.303L8.2 2.02c-.46-.171-.701-.408-.701-.926V.824C7.5.309 7.818 0 8.348 0h6.968c.531 0 .85.309.85.824v.271c0 .514-.249.755-.709.926l-1.031.34c-.743.272-.992.583-.992 1.303v16.664c0 .72.249 1.028.992 1.303l1.024.342c.46.172.708.408.708.926v.272c0 .515-.318.824-.85.824L8.342 24z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
