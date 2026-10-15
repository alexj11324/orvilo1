'use client';

import { memo } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';

import { createBrandHelpers } from '../../_internal/helpers.js';
import { TITLE } from '../style';

const { _objectSpread, _objectWithoutProperties } = createBrandHelpers();

const _excluded = ['size', 'style'];
const Icon = /*#__PURE__*/ memo(function (_ref) {
  var _ref$size = _ref.size,
    size = _ref$size === void 0 ? '1em' : _ref$size,
    style = _ref.style,
    rest = _objectWithoutProperties(_ref, _excluded);
  return /*#__PURE__*/ _jsxs(
    'svg',
    _objectSpread(
      _objectSpread(
        {
          fill: 'currentColor',
          fillRule: 'evenodd',
          height: size,
          style: _objectSpread(
            {
              flex: 'none',
              lineHeight: 1,
            },
            style,
          ),
          viewBox: '0 0 24 24',
          width: size,
          xmlns: 'http://www.w3.org/2000/svg',
        },
        rest,
      ),
      {},
      {
        children: [
          /*#__PURE__*/ _jsx('title', {
            children: TITLE,
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M19.956 10.178C19.8934 10.7544 19.724 11.6784 19.1182 12.5274C18.3667 13.5817 17.3528 13.8824 16.9558 13.9746C16.6911 14.0049 16.3026 14.045 15.8323 14.0789C14.1804 14.2045 13.0525 14.1565 11.7041 14.131C10.81 14.1143 9.54304 14.1034 7.98548 14.131C7.97564 16.7493 7.96551 19.368 7.95508 21.987L5 22V15.8717C5.00358 14.6542 5.00983 12.9193 5.03397 10.7643C6.47441 10.7684 14.6905 10.7205 15.6696 10.7721C15.8672 10.7841 16.3621 10.8039 16.6764 10.4458C16.8842 10.2113 16.9696 9.83348 16.9763 9.26802C16.9835 8.82659 16.9902 8.38204 16.9763 7.94322C16.9459 6.90454 16.608 6.51472 15.7103 6.51107C12.8124 6.5069 9.91142 6.43915 7.01356 6.51107C6.60048 6.51888 5.90083 6.53087 5.02056 6.50325V3C5.43007 3.00782 6.13285 3.02397 7.00686 3.01563C11.1399 2.98436 12.7292 3.01199 15.5328 3.01563C18.3591 3.0198 19.994 4.94393 19.994 8.26009C19.9913 8.90059 20.0253 9.54944 19.956 10.178Z',
          }),
          /*#__PURE__*/ _jsx('path', {
            d: 'M20 19H11V22H20V19Z',
          }),
        ],
      },
    ),
  );
});
export default Icon;
