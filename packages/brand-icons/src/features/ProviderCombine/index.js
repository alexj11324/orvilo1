'use client';

import { memo, useMemo } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';

import { createBrandHelpers } from '../../_internal/helpers.js';
import { NativeIconLayout as Flexbox } from '../NativeIconLayout';
import { providerMappings } from '../providerConfig';
import DefaultIcon from '../ProviderIcon/DefaultIcon';

const { _objectSpread, _objectWithoutProperties, _createForOfIteratorHelper } =
  createBrandHelpers();

const _excluded = ['provider', 'size', 'type'];
const ProviderCombine = /*#__PURE__*/ memo(function (_ref) {
  var _Render$Icon, _Render$Icon2;
  var originProvider = _ref.provider,
    _ref$size = _ref.size,
    size = _ref$size === void 0 ? 12 : _ref$size,
    _ref$type = _ref.type,
    type = _ref$type === void 0 ? 'color' : _ref$type,
    rest = _objectWithoutProperties(_ref, _excluded);
  var Render = useMemo(
    function () {
      if (!originProvider) return;
      var provider = originProvider.toLowerCase();
      var _iterator = _createForOfIteratorHelper(providerMappings),
        _step;
      try {
        for (_iterator.s(); !(_step = _iterator.n()).done;) {
          var item = _step.value;
          if (
            item.keywords.some(function (keyword) {
              return keyword.toLowerCase() === provider;
            })
          ) {
            return item;
          }
        }
      } catch (err) {
        _iterator.e(err);
      } finally {
        _iterator.f();
      }
    },
    [originProvider],
  );
  var iconProps = _objectSpread(
    {
      size: size * ((Render === null || Render === void 0 ? void 0 : Render.combineMultiple) || 1),
      type,
    },
    Render === null || Render === void 0 ? void 0 : Render.props,
  );
  var icon =
    Render !== null && Render !== void 0 && Render.Combine
      ? /*#__PURE__*/ _jsx(Render.Combine, _objectSpread({}, iconProps))
      : Render !== null &&
          Render !== void 0 &&
          (_Render$Icon = Render.Icon) !== null &&
          _Render$Icon !== void 0 &&
          _Render$Icon.Combine
        ? /*#__PURE__*/ _jsx(Render.Icon.Combine, _objectSpread({}, iconProps))
        : Render !== null &&
            Render !== void 0 &&
            (_Render$Icon2 = Render.Icon) !== null &&
            _Render$Icon2 !== void 0 &&
            _Render$Icon2.Text
          ? /*#__PURE__*/ _jsx(Render.Icon.Text, _objectSpread({}, iconProps))
          : /*#__PURE__*/ _jsx(DefaultIcon, {
              size,
            });
  return /*#__PURE__*/ _jsx(
    Flexbox,
    _objectSpread(
      _objectSpread(
        {
          align: 'center',
          flex: 'none',
          height: size * 1.5,
          horizontal: true,
          width: 'fit-content',
        },
        rest,
      ),
      {},
      {
        children: icon,
      },
    ),
  );
});
ProviderCombine.displayName = 'ProviderCombine';
export default ProviderCombine;
