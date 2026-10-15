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
            d: 'M15.99 2.444h-2.135v4.69l2.134.006V2.444zM11.06 5.153l2.224 2.225L11.77 8.88 9.552 6.662l1.51-1.51zM6.845 9.455h4.696l-.007 2.133h-4.69V9.456zm2.71 4.928l2.222-2.224 1.505 1.514-2.218 2.217-1.51-1.509.001.002zm4.3 4.216v-4.696l2.134.007v4.69h-2.134zm4.928-2.706l-2.225-2.225 1.514-1.504 2.22 2.22-1.51 1.51h.001zM23 11.588h-4.696l.007-2.133H23v2.133zm-2.709-4.926l-2.223 2.223-1.504-1.513 2.22-2.22 1.507 1.51zM3.2 2.926V4.13H1.994v1.929H3.2v1.204h1.927V6.059h1.204V4.131H5.127V2.926H3.2zm0 18.835v-2.2H1v-1.927h2.2v-2.198h1.927v2.198h2.2v1.927h-2.2v2.2H3.2z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
