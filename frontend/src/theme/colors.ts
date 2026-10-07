/**
 * Semantic color tokens inspired by Google Photos / Material 3.
 * Reference by name only — never hardcode palette values in components.
 */
export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  scrim: string;
  /** Fully opaque scrim behind fullscreen media (viewer, video player). */
  scrimSolid: string;
  text: string;
  textSecondary: string;
  textDisabled: string;
  accent: string;
  accentSoft: string;
  outline: string;
  icon: string;
  iconInactive: string;
  danger: string;
  /** Always-white text for overlays on top of media. */
  textInverse: string;
  /** Icon/text color on top of an accent fill (selection check). */
  onAccent: string;
  /** Accent-tinted icon over media (favorite heart in the viewer). */
  onMediaAccent: string;
  /** Near-opaque background for sticky headers. */
  backgroundSoft: string;
  tabBar: string;
  header: string;
  /** Fallback while thumbnails decode. */
  placeholder: string;
  backdrop: string;
}

export const lightColors: ThemeColors = {
  background: '#FFFFFF',
  surface: '#F5F6F7',
  surfaceElevated: '#FFFFFF',
  scrim: 'rgba(0, 0, 0, 0.45)',
  scrimSolid: '#000000',
  text: '#202124',
  textSecondary: '#5F6368',
  textDisabled: '#9AA0A6',
  accent: '#1A73E8',
  accentSoft: 'rgba(26, 115, 232, 0.12)',
  outline: '#DADCE0',
  icon: '#3C4043',
  iconInactive: '#80868B',
  danger: '#D93025',
  textInverse: '#FFFFFF',
  onAccent: '#0B0B0D',
  onMediaAccent: '#7EACF8',
  backgroundSoft: 'rgba(255, 255, 255, 0.95)',
  tabBar: '#FFFFFF',
  header: '#FFFFFF',
  placeholder: '#E8EAED',
  backdrop: 'rgba(0, 0, 0, 0.35)',
};

export const darkColors: ThemeColors = {
  background: '#0B0B0D',
  surface: '#17171A',
  surfaceElevated: '#202124',
  scrim: 'rgba(0, 0, 0, 0.6)',
  scrimSolid: '#000000',
  text: '#E8EAED',
  textSecondary: '#9AA0A6',
  textDisabled: '#5F6368',
  accent: '#8AB4F8',
  accentSoft: 'rgba(138, 180, 248, 0.16)',
  outline: '#3C4043',
  icon: '#E8EAED',
  iconInactive: '#9AA0A6',
  danger: '#F28B82',
  textInverse: '#FFFFFF',
  onAccent: '#0B0B0D',
  onMediaAccent: '#7EACF8',
  backgroundSoft: 'rgba(11, 11, 13, 0.95)',
  tabBar: '#0B0B0D',
  header: '#0B0B0D',
  placeholder: '#202124',
  backdrop: 'rgba(0, 0, 0, 0.5)',
};
