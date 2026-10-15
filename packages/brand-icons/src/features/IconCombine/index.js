'use client';

import { memo } from 'react';
import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';

import { createBrandHelpers } from '../../_internal/helpers.js';
import { NativeIconLayout as Flexbox } from '../NativeIconLayout';

const { _objectSpread, _objectWithoutProperties } = createBrandHelpers();

const _excluded = [
  'Icon',
  'style',
  'Text',
  'color',
  'size',
  'spaceMultiple',
  'textMultiple',
  'extra',
  'extraStyle',
  'showText',
  'showLogo',
  'extraClassName',
  'iconProps',
  'inverse',
];
const IconCombine = /*#__PURE__*/ memo(function (_ref) {
  var Icon = _ref.Icon,
    style = _ref.style,
    Text = _ref.Text,
    color = _ref.color,
    _ref$size = _ref.size,
    size = _ref$size === void 0 ? 24 : _ref$size,
    _ref$spaceMultiple = _ref.spaceMultiple,
    spaceMultiple = _ref$spaceMultiple === void 0 ? 1 : _ref$spaceMultiple,
    _ref$textMultiple = _ref.textMultiple,
    textMultiple = _ref$textMultiple === void 0 ? 1 : _ref$textMultiple,
    extra = _ref.extra,
    extraStyle = _ref.extraStyle,
    _ref$showText = _ref.showText,
    showText = _ref$showText === void 0 ? true : _ref$showText,
    _ref$showLogo = _ref.showLogo,
    showLogo = _ref$showLogo === void 0 ? true : _ref$showLogo,
    extraClassName = _ref.extraClassName,
    iconProps = _ref.iconProps,
    inverse = _ref.inverse,
    rest = _objectWithoutProperties(_ref, _excluded);
  var logo =
    Icon &&
    showLogo &&
    /*#__PURE__*/ _jsx(
      Icon,
      _objectSpread(
        _objectSpread(
          {
            size,
          },
          iconProps,
        ),
        {},
        {
          style: inverse
            ? _objectSpread(
                {
                  marginLeft: size * spaceMultiple,
                },
                iconProps === null || iconProps === void 0 ? void 0 : iconProps.style,
              )
            : _objectSpread(
                {
                  marginRight: size * spaceMultiple,
                },
                iconProps === null || iconProps === void 0 ? void 0 : iconProps.style,
              ),
        },
      ),
    );
  var text =
    showText &&
    Text &&
    /*#__PURE__*/ _jsx(Text, {
      size: size * textMultiple,
    });
  return /*#__PURE__*/ _jsxs(
    Flexbox,
    _objectSpread(
      _objectSpread(
        {
          align: 'center',
          flex: 'none',
          horizontal: true,
          justify: 'flex-start',
          style: _objectSpread(
            {
              color,
            },
            style,
          ),
        },
        rest,
      ),
      {},
      {
        children: [
          inverse
            ? /*#__PURE__*/ _jsxs(_Fragment, {
                children: [text, logo],
              })
            : /*#__PURE__*/ _jsxs(_Fragment, {
                children: [logo, text],
              }),
          extra &&
            /*#__PURE__*/ _jsx('span', {
              className: extraClassName,
              style: _objectSpread(
                {
                  fontSize: size * textMultiple * 0.95,
                  lineHeight: 1,
                },
                extraStyle,
              ),
              children: extra,
            }),
        ],
      },
    ),
  );
});
export default IconCombine;
