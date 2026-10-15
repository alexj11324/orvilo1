'use client';

import { memo } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';

import { createBrandHelpers } from '../../_internal/helpers.js';
import IconAvatar from '../../features/IconAvatar';
import { AVATAR_BACKGROUND, AVATAR_COLOR, AVATAR_ICON_MULTIPLE, TITLE } from '../style';
import Mono from './Mono';

const { _objectSpread, _objectDestructuringEmpty } = createBrandHelpers();

const Avatar = /*#__PURE__*/ memo(function (_ref) {
  var rest = Object.assign({}, (_objectDestructuringEmpty(_ref), _ref));
  return /*#__PURE__*/ _jsx(
    IconAvatar,
    _objectSpread(
      {
        'Icon': Mono,
        'aria-label': TITLE,
        'background': AVATAR_BACKGROUND,
        'color': AVATAR_COLOR,
        'iconMultiple': AVATAR_ICON_MULTIPLE,
        'iconStyle': {
          marginLeft: rest.size * 0.1,
        },
      },
      rest,
    ),
  );
});
export default Avatar;
