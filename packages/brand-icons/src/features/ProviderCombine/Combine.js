import { memo } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';

import { createBrandHelpers } from '../../_internal/helpers.js';
import { NativeIconDivider as Divider, NativeIconLayout as Flexbox } from '../NativeIconLayout';

const { _objectSpread, _objectWithoutProperties } = createBrandHelpers();

const _excluded = ['left', 'right', 'size'];
const Combine = /*#__PURE__*/ memo(function (_ref) {
  var left = _ref.left,
    right = _ref.right,
    _ref$size = _ref.size,
    size = _ref$size === void 0 ? 24 : _ref$size,
    rest = _objectWithoutProperties(_ref, _excluded);
  return /*#__PURE__*/ _jsxs(
    Flexbox,
    _objectSpread(
      _objectSpread(
        {
          align: 'center',
          flex: 'none',
          gap: size / 3,
          horizontal: true,
        },
        rest,
      ),
      {},
      {
        children: [
          left,
          /*#__PURE__*/ _jsx(Divider, {
            style: {
              marginBlock: 0,
              marginInline: size / 6,
            },
            type: 'vertical',
          }),
          right,
        ],
      },
    ),
  );
});
export default Combine;
