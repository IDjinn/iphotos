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
  /** Storage/progress bar track behind the fill. */
  track: string;
  tabBar: string;
  header: string;
  /** Fallback while thumbnails decode. */
  placeholder: string;
  backdrop: string;
  /** Liquid-glass dialog fill (translucent). */
  glassFill: string;
  /** Liquid-glass dialog border. */
  glassBorder: string;
  /** Top-edge highlight for the glass card. */
  glassHighlight: string;
  /** Translucent fill for glass secondary buttons. */
  glassButton: string;
}

/**
 * Warm "espresso & honey" palette. Dark is the brand theme:
 * fundo #141210 · chrome #191612 · superfícies #211D18/#2D261D ·
 * primary #FFAA32 (hover #FFC05C) · texto #F5EFE5 · secundário #B7AA98 ·
 * borda #40372B · progress track #493827.
 * The light theme is the warm counterpart (cream surfaces, toasted honey accent).
 */
export const lightColors: ThemeColors = {
  background: '#FFF8EF',
  surface: '#F5EBDC',
  surfaceElevated: '#FFFFFF',
  scrim: 'rgba(43, 33, 25, 0.45)',
  scrimSolid: '#000000',
  text: '#2B2119',
  textSecondary: '#7C6555',
  textDisabled: '#B5A18D',
  accent: '#B45309',
  accentSoft: 'rgba(180, 83, 9, 0.10)',
  outline: '#E6D6C0',
  icon: '#3D2E22',
  iconInactive: '#8A7561',
  danger: '#D93025',
  textInverse: '#FFFFFF',
  onAccent: '#FFF8EF',
  onMediaAccent: '#D97706',
  backgroundSoft: 'rgba(255, 248, 239, 0.95)',
  track: '#EAD9BF',
  tabBar: '#FFF8EF',
  header: '#FFF8EF',
  placeholder: '#F0E3CE',
  backdrop: 'rgba(43, 33, 25, 0.35)',
  glassFill: 'rgba(255, 252, 246, 0.95)',
  glassBorder: 'rgba(255, 255, 255, 0.85)',
  glassHighlight: 'rgba(255, 255, 255, 0.95)',
  glassButton: 'rgba(43, 33, 25, 0.05)',
};

export const darkColors: ThemeColors = {
  background: '#141210',
  surface: '#211D18',
  surfaceElevated: '#2D261D',
  scrim: 'rgba(10, 9, 8, 0.6)',
  scrimSolid: '#000000',
  text: '#F5EFE5',
  textSecondary: '#B7AA98',
  textDisabled: 'rgba(183, 170, 152, 0.55)',
  accent: '#FFAA32',
  accentSoft: 'rgba(255, 170, 50, 0.16)',
  outline: '#40372B',
  icon: '#F5EFE5',
  iconInactive: '#B7AA98',
  danger: '#F28B82',
  textInverse: '#FFFFFF',
  onAccent: '#141210',
  onMediaAccent: '#FFC05C',
  backgroundSoft: 'rgba(20, 18, 16, 0.95)',
  track: '#493827',
  tabBar: '#191612',
  header: '#191612',
  placeholder: '#211D18',
  backdrop: 'rgba(0, 0, 0, 0.55)',
  glassFill: 'rgba(33, 29, 24, 0.95)',
  glassBorder: 'rgba(245, 239, 229, 0.18)',
  glassHighlight: 'rgba(245, 239, 229, 0.32)',
  glassButton: 'rgba(245, 239, 229, 0.08)',
};
