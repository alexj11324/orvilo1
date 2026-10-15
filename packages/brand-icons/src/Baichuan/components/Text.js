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
          viewBox: '0 0 45 24',
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
            d: 'M2 2v2.712h8.136L9.57 7.198H4.26v14.576h2.712v-1.356h9.717v1.356h2.938V7.198H12.51l.677-2.486h8.362V2H2zm4.972 16.045v-2.938h9.717v2.825l-9.717.113zm0-8.361v2.937l9.717-.113V9.684H6.972zm21.921-7.571h-2.825v10.735c0 1.92-1.133 4.988-2.712 7.231L25.729 22c1.873-2.578 3.164-6.667 3.164-8.927V2.113zm4.067.904h2.712v16.61h-2.711l-.001-16.61zM42.452 2H39.74v19.661h2.712V2z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
