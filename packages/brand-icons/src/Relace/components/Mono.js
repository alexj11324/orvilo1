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
            d: 'M23 23H1V1h22v22zM2.962 15.232c1.969.3 5.028.42 7.78-.171.904-.195 1.743-.46 2.49-.803-1.395-3.4-1.675-5.766-1.264-7.378.466-1.823 1.799-2.59 2.998-2.602h.01c.688 0 2.117.177 3.081 1.35 1.003 1.22 1.216 3.152.26 5.991-.504 1.493-1.437 2.616-2.594 3.456 1.323 2.993 2.11 4.498 2.588 5.284.223.367.372.564.467.679h2.26V2.962H2.962v12.27zm11.05.827c-.912.413-1.887.711-2.857.92-2.91.626-6.059.527-8.193.234v3.825h13.471c-.527-.92-1.287-2.424-2.421-4.98zm.97-9.82c-.323.005-.87.181-1.112 1.127-.25.975-.161 2.776 1.055 5.84.705-.598 1.233-1.329 1.531-2.213.868-2.576.455-3.67.086-4.119-.406-.494-1.09-.633-1.56-.634z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
