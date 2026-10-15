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
          viewBox: '0 0 80 24',
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
            d: 'M74.74 8.828c-.539-2.284-1.416-3.083-3.726-3.331a10.18 10.18 0 00-1.957-.042c-3.072.249-4.067 1.338-4.067 4.392 0 1.57-.013 3.14.005 4.71.023 2.076.969 3.5 2.996 3.865 1.362.244 2.879.175 4.22-.168 1.723-.437 2.488-1.946 2.307-3.863h-4.586v-2.918h8.088c0 .527.017 1.048.035 1.565.038 1.13.075 2.237-.075 3.317-.4 2.926-2.839 5.147-6.288 5.556-1.726.204-3.596.052-5.28-.398-3.13-.839-4.854-3.392-4.874-6.632-.013-1.875-.003-3.75 0-5.626.002-4.039 1.66-6.147 5.633-6.943 2.703-.542 5.398-.459 7.892.903 2.155 1.179 3.124 3.054 3.035 5.608h-3.352l-.005.005zM57.685 21.748h-3.159V5.638h-9.198v16.074h-3.24V2.697h15.597v19.051zM30.807 18.849h-8.205V2.513h-3.13v19.16h11.335v-2.824zM36.876 21.735h-3.023V2.511h3.023v19.224zM2 21.735h3.022v-9.117h.042l8.12 9.056h3.747l-8.12-9.056h-.125l8.12-9.993h-3.748l-8.036 9.89V2.511H2v19.224z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
