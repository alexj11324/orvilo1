'use client';

import { memo } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';

import { createBrandHelpers } from '../../_internal/helpers.js';
import IconCombine from '../../features/IconCombine';
import { COMBINE_SPACE_MULTIPLE, COMBINE_TEXT_MULTIPLE, TITLE } from '../style';
import Text from './Text';

const { _objectSpread, _objectDestructuringEmpty } = createBrandHelpers();

const Combine = /*#__PURE__*/ memo(function (_ref) {
  var rest = Object.assign({}, (_objectDestructuringEmpty(_ref), _ref));
  return /*#__PURE__*/ _jsx(
    IconCombine,
    _objectSpread(
      {
        Text,
        'aria-label': TITLE,
        'spaceMultiple': COMBINE_SPACE_MULTIPLE,
        'textMultiple': COMBINE_TEXT_MULTIPLE,
      },
      rest,
    ),
  );
});
export default Combine;
