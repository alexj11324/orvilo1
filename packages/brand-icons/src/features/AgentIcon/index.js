'use client';

import { memo, useMemo } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';

import { createBrandHelpers } from '../../_internal/helpers.js';
import { agentMappings } from '../agentConfig';
import DefaultAvatar from './DefaultAvatar';
import DefaultIcon from './DefaultIcon';

const { _objectSpread, _objectWithoutProperties, _createForOfIteratorHelper } =
  createBrandHelpers();

const _excluded = ['agent', 'size', 'type', 'shape'];
const AgentIcon = /*#__PURE__*/ memo(function (_ref) {
  var originAgent = _ref.agent,
    _ref$size = _ref.size,
    size = _ref$size === void 0 ? 12 : _ref$size,
    _ref$type = _ref.type,
    type = _ref$type === void 0 ? 'avatar' : _ref$type,
    shape = _ref.shape,
    rest = _objectWithoutProperties(_ref, _excluded);
  var Render = useMemo(
    function () {
      if (!originAgent) return;
      var model = originAgent.toLowerCase();
      var _iterator = _createForOfIteratorHelper(agentMappings),
        _step;
      try {
        for (_iterator.s(); !(_step = _iterator.n()).done;) {
          var item = _step.value;
          if (
            item.keywords.some(function (keyword) {
              return new RegExp(keyword, 'i').test(model);
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
    [originAgent],
  );
  var props = _objectSpread(
    _objectSpread(
      {
        size,
      },
      Render === null || Render === void 0 ? void 0 : Render.props,
    ),
    rest,
  );
  switch (type) {
    case 'avatar': {
      if (!(Render !== null && Render !== void 0 && Render.Icon))
        return /*#__PURE__*/ _jsx(
          DefaultAvatar,
          _objectSpread(
            {
              shape,
            },
            props,
          ),
        );
      return /*#__PURE__*/ _jsx(
        Render.Icon.Avatar,
        _objectSpread(
          {
            shape,
          },
          props,
        ),
      );
    }
    case 'mono': {
      if (!(Render !== null && Render !== void 0 && Render.Icon))
        return /*#__PURE__*/ _jsx(DefaultIcon, _objectSpread({}, props));
      return /*#__PURE__*/ _jsx(Render.Icon, _objectSpread({}, props));
    }
    case 'color': {
      var _Render$Icon;
      if (!(Render !== null && Render !== void 0 && Render.Icon))
        return /*#__PURE__*/ _jsx(DefaultIcon, _objectSpread({}, props));
      return (_Render$Icon = Render.Icon) !== null && _Render$Icon !== void 0 && _Render$Icon.Color
        ? /*#__PURE__*/ _jsx(Render.Icon.Color, _objectSpread({}, props))
        : /*#__PURE__*/ _jsx(Render.Icon, _objectSpread({}, props));
    }
    case 'combine': {
      var _Render$Icon2, _Render$Icon3, _Render$Icon4;
      if (!(Render !== null && Render !== void 0 && Render.Icon))
        return /*#__PURE__*/ _jsx(DefaultIcon, _objectSpread({}, props));
      return (_Render$Icon2 = Render.Icon) !== null &&
        _Render$Icon2 !== void 0 &&
        _Render$Icon2.Combine
        ? /*#__PURE__*/ _jsx(
            Render.Icon.Combine,
            _objectSpread(
              {
                type: 'mono',
              },
              props,
            ),
          )
        : (_Render$Icon3 = Render.Icon) !== null && _Render$Icon3 !== void 0 && _Render$Icon3.Brand
          ? /*#__PURE__*/ _jsx(Render.Icon.Brand, _objectSpread({}, props))
          : (_Render$Icon4 = Render.Icon) !== null && _Render$Icon4 !== void 0 && _Render$Icon4.Text
            ? /*#__PURE__*/ _jsx(Render.Icon.Text, _objectSpread({}, props))
            : /*#__PURE__*/ _jsx(Render.Icon, _objectSpread({}, props));
    }
    case 'combine-color': {
      var _Render$Icon5, _Render$Icon6, _Render$Icon7;
      if (!(Render !== null && Render !== void 0 && Render.Icon))
        return /*#__PURE__*/ _jsx(DefaultIcon, _objectSpread({}, props));
      return (_Render$Icon5 = Render.Icon) !== null &&
        _Render$Icon5 !== void 0 &&
        _Render$Icon5.Combine
        ? /*#__PURE__*/ _jsx(
            Render.Icon.Combine,
            _objectSpread(
              {
                type: 'color',
              },
              props,
            ),
          )
        : (_Render$Icon6 = Render.Icon) !== null &&
            _Render$Icon6 !== void 0 &&
            _Render$Icon6.BrandColor
          ? /*#__PURE__*/ _jsx(Render.Icon.BrandColor, _objectSpread({}, props))
          : (_Render$Icon7 = Render.Icon) !== null && _Render$Icon7 !== void 0 && _Render$Icon7.Text
            ? /*#__PURE__*/ _jsx(Render.Icon.Text, _objectSpread({}, props))
            : /*#__PURE__*/ _jsx(Render.Icon, _objectSpread({}, props));
    }
    default: {
      return /*#__PURE__*/ _jsx(DefaultIcon, _objectSpread({}, props));
    }
  }
});
AgentIcon.displayName = 'AgentIcon';
export default AgentIcon;
