'use client';

import { memo } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';

import { createBrandHelpers } from '../../_internal/helpers.js';
import IconCombine from '../../features/IconCombine';
import { COLOR_PRIMARY, COMBINE_SPACE_MULTIPLE, COMBINE_TEXT_MULTIPLE, TITLE } from '../style';
import Text from './Text';

const { _objectSpread, _objectWithoutProperties } = createBrandHelpers();

const _excluded = ['type'];
const Combine = /*#__PURE__*/ memo(function (_ref) {
  var _ref$type = _ref.type,
    type = _ref$type === void 0 ? 'mono' : _ref$type,
    rest = _objectWithoutProperties(_ref, _excluded);
  return /*#__PURE__*/ _jsx(
    IconCombine,
    _objectSpread(
      {
        Text,
        'aria-label': TITLE,
        'color': type === 'color' ? COLOR_PRIMARY : undefined,
        'spaceMultiple': COMBINE_SPACE_MULTIPLE,
        'textMultiple': COMBINE_TEXT_MULTIPLE,
      },
      rest,
    ),
  );
});
export default Combine;
