'use client';

import { memo } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';

import { createBrandHelpers } from '../../_internal/helpers.js';
import IconCombine from '../../features/IconCombine';
import { COMBINE_SPACE_MULTIPLE, COMBINE_TEXT_MULTIPLE, TITLE } from '../style';
import Mono from './Mono';
import Text from './Text';

const { _objectSpread, _objectWithoutProperties } = createBrandHelpers();

const _excluded = ['extraStyle'];
const Combine = /*#__PURE__*/ memo(function (_ref) {
  var extraStyle = _ref.extraStyle,
    rest = _objectWithoutProperties(_ref, _excluded);
  return /*#__PURE__*/ _jsx(
    IconCombine,
    _objectSpread(
      {
        'Icon': Mono,
        Text,
        'aria-label': TITLE,
        'extraStyle': _objectSpread(
          {
            fontWeight: 600,
          },
          extraStyle,
        ),
        'spaceMultiple': COMBINE_SPACE_MULTIPLE,
        'textMultiple': COMBINE_TEXT_MULTIPLE,
      },
      rest,
    ),
  );
});
export default Combine;
