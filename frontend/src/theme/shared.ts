import { css } from 'styled-components/native';

import { ELEVATION } from './tokens';

/** Fill the parent absolutely — replaces StyleSheet.absoluteFill. */
export const absoluteFill = css`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
`;

/** Soft shadow for transient chrome (toasts, pills). */
export const elevationLow = css`
  elevation: ${ELEVATION.low};
  shadow-color: #000000;
  shadow-opacity: 0.25;
  shadow-radius: 8;
  shadow-offset: 0px 2px;
`;

/** Stronger shadow for floating action bars. */
export const elevationMedium = css`
  elevation: ${ELEVATION.medium};
  shadow-color: #000000;
  shadow-opacity: 0.3;
  shadow-radius: 10;
  shadow-offset: 0px 4px;
`;
