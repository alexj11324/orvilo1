'use client';

import { memo, useMemo } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';

import { createBrandHelpers } from '../../_internal/helpers.js';
import IconAvatar from '../../features/IconAvatar';
import {
  AVATAR_BACKGROUND,
  AVATAR_COLOR,
  AVATAR_ICON_MULTIPLE,
  COLOR_GPT_3,
  COLOR_GPT_4,
  COLOR_GPT_5,
  COLOR_O_1,
  COLOR_OSS,
  COLOR_PLATFORM,
  TITLE,
} from '../style';
import Mono from './Mono';

const { _objectSpread, _objectWithoutProperties } = createBrandHelpers();

const _excluded = ['type'];
const Avatar = /*#__PURE__*/ memo(function (_ref) {
  var _ref$type = _ref.type,
    type = _ref$type === void 0 ? 'normal' : _ref$type,
    rest = _objectWithoutProperties(_ref, _excluded);
  var background = useMemo(
    function () {
      switch (type) {
        case 'gpt3': {
          return COLOR_GPT_3;
        }
        case 'gpt4': {
          return COLOR_GPT_4;
        }
        case 'gpt5': {
          return COLOR_GPT_5;
        }
        case 'o3':
        case 'o1': {
          return COLOR_O_1;
        }
        case 'oss': {
          return COLOR_OSS;
        }
        case 'platform': {
          return COLOR_PLATFORM;
        }
        default: {
          return AVATAR_BACKGROUND;
        }
      }
    },
    [type],
  );
  return /*#__PURE__*/ _jsx(
    IconAvatar,
    _objectSpread(
      {
        'Icon': Mono,
        'aria-label': TITLE,
        background,
        'color': AVATAR_COLOR,
        'iconMultiple': AVATAR_ICON_MULTIPLE,
      },
      rest,
    ),
  );
});
export default Avatar;
