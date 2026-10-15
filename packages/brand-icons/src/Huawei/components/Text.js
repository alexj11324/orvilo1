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
          viewBox: '0 0 120 24',
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
            d: 'M6.068 2.132H2v19.473h4.068V13.71h8.923v7.895h3.937V2.132H14.99v7.894H6.068V2.132zm31.23 11.184c0 3.158-1.574 4.868-4.46 4.868-2.888 0-4.462-1.71-4.462-5V2.132h-3.937v11.184c0 5.526 3.018 8.684 8.398 8.684s8.398-3.158 8.398-8.816V2.132H37.3v11.184zM75.354 2.132l-4.462 13.42-4.33-13.42h-4.199l6.824 19.473h3.28l4.462-12.763 4.33 12.763h3.412l6.692-19.473h-4.068l-4.33 13.42-4.462-13.42h-3.15zm30.312 7.5h-7.217V5.684h10.498V2.132H94.511v19.473h14.828v-3.552H98.448v-4.869h7.217V9.632zm8.398-7.5H118v19.473h-3.937V2.132zM57.9 17.526l1.706 4.08h4.2l-8.53-19.474L55.145 2h-3.412l-8.53 19.605h4.069l1.705-3.816.132-.263H57.9zM53.44 7l2.756 6.579.13.395H50.29l.13-.395L53.44 7z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
