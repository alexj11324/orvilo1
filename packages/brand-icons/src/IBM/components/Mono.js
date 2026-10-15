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
            d: 'M24 16.333V17h-3.158v-.667H24zm-7.579 0V17h-3.158v-.667h3.158zm2.464 0L18.63 17l-.25-.667h.504zm-7.075 0a2.528 2.528 0 01-1.717.667h-5.04v-.667h6.757zm-7.389 0V17H0v-.667h4.421zm12-1.333v.667h-3.158V15h3.158zm2.958 0l-.246.667h-1L17.885 15h1.494zm-6.937 0c-.057.237-.148.46-.265.667H5.053V15h7.39zm-8.02 0v.667H0V15h4.421zM24 15v.667h-3.158V15H24zm-1.263-1.333v.666h-1.895v-.666h1.895zm-6.316 0v.666h-1.895v-.666h1.895zm3.453 0l-.248.666h-1.989l-.25-.666h2.487zm-7.52 0c.056.212.088.435.088.666h-2.337v-.666h2.249zm-4.143 0v.666H6.316v-.666H8.21zm-5.053 0v.666H1.263v-.666h1.895zm19.579-1.334V13h-1.895v-.667h1.895zm-6.316 0V13h-1.895v-.667h1.895zm3.948 0l-.247.667h-2.987l-.245-.667h3.48zm-8.792 0c.218.188.405.414.55.667H6.315v-.667h5.26zm-8.42 0V13H1.264v-.667h1.895zM18.456 11l.177.539.176-.539h3.929v.667h-1.895v-.613l-.215.613H16.63l-.209-.613v.613h-1.895V11h3.929zM3.158 11v.667H1.263V11h1.895zm8.968 0a2.555 2.555 0 01-.55.667h-5.26V11h5.81zm10.61-1.333v.666h-3.709l.224-.666h3.486zm-4.722 0l.224.666h-3.712v-.666h3.488zm-5.572 0c0 .23-.032.454-.088.666h-2.249v-.666h2.337zm-4.231 0v.666H6.316v-.666H8.21zm-5.053 0v.666H1.263v-.666h1.895zm14.419-1.334l.22.667h-4.534v-.667h4.314zm6.423 0V9h-4.536l.229-.667H24zm-11.823 0c.117.206.208.43.265.667h-7.39v-.667h7.125zm-7.756 0V9H0v-.667h4.421zM17.133 7l.224.667h-4.094V7h3.87zM24 7v.667h-4.089L20.13 7H24zM10.093 7c.662 0 1.264.253 1.717.667H5.053V7h5.04zM4.42 7v.667H0V7h4.421z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
