'use client';

import { memo } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';

import { createBrandHelpers } from '../../_internal/helpers.js';
import IconCombine from '../../features/IconCombine';
import Mono from '../../OpenAI/components/Mono';
import { COMBINE_SPACE_MULTIPLE, COMBINE_TEXT_MULTIPLE, TITLE } from '../style';
import Text from './Text';

const { _objectSpread, _objectWithoutProperties } = createBrandHelpers();

const _excluded = ['extraStyle', 'size'];
const Combine = /*#__PURE__*/ memo(function (_ref) {
  var extraStyle = _ref.extraStyle,
    _ref$size = _ref.size,
    size = _ref$size === void 0 ? 24 : _ref$size,
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
            fontSize: size * 0.85,
            marginLeft: size * COMBINE_SPACE_MULTIPLE,
          },
          extraStyle,
        ),
        size,
        'spaceMultiple': COMBINE_SPACE_MULTIPLE,
        'textMultiple': COMBINE_TEXT_MULTIPLE,
      },
      rest,
    ),
  );
});
export default Combine;
