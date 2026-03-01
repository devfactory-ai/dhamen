/**
 * Dhamen Mobile Design System
 * Unified theme for consistent UI/UX across the app
 */

// Color Palette
export const colors = {
  // Base colors
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',

  // Primary Brand Colors
  primary: {
    50: '#e8f4fd',
    100: '#d1e9fb',
    200: '#a3d3f7',
    300: '#75bdf3',
    400: '#47a7ef',
    500: '#1e3a5f', // Main brand color
    600: '#1a3354',
    700: '#162c49',
    800: '#12253e',
    900: '#0e1e33',
  },

  // Secondary/Accent Colors
  accent: {
    teal: '#0d9488',
    cyan: '#06b6d4',
    emerald: '#10b981',
  },

  // Status Colors with numbered scale for consistency
  success: {
    50: '#ecfdf5',
    100: '#d1fae5',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
    // Semantic aliases
    light: '#d1fae5',
    main: '#10b981',
    dark: '#059669',
  },
  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    // Semantic aliases
    light: '#fef3c7',
    main: '#f59e0b',
    dark: '#d97706',
  },
  error: {
    50: '#fef2f2',
    100: '#fee2e2',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    // Semantic aliases
    light: '#fee2e2',
    main: '#ef4444',
    dark: '#dc2626',
  },
  info: {
    50: '#eff6ff',
    100: '#dbeafe',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    // Semantic aliases
    light: '#dbeafe',
    main: '#3b82f6',
    dark: '#2563eb',
  },

  // Neutral Colors
  neutral: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#e5e5e5',
    300: '#d4d4d4',
    400: '#a3a3a3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
  },
  // Alias for backward compatibility
  gray: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#e5e5e5',
    300: '#d4d4d4',
    400: '#a3a3a3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
  },

  // Semantic Colors
  background: {
    primary: '#f8fafc',
    secondary: '#ffffff',
    tertiary: '#f1f5f9',
  },
  text: {
    primary: '#1e293b',
    secondary: '#64748b',
    tertiary: '#94a3b8',
    inverse: '#ffffff',
  },
  border: {
    light: '#e2e8f0',
    main: '#cbd5e1',
    dark: '#94a3b8',
  },
};

// Typography
export const typography = {
  fontFamily: {
    regular: 'System',
    medium: 'System',
    semibold: 'System',
    bold: 'System',
  },
  fontSize: {
    xs: 10,
    sm: 12,
    base: 14,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};

// Spacing
export const spacing = {
  // Numeric scale
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  // Semantic aliases
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  '3xl': 32,
  '4xl': 40,
};

// Border Radius
export const borderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  '2xl': 20,
  '3xl': 24,
  full: 9999,
};

// Shadows
export const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
};

// Animation Durations
export const animations = {
  fast: 150,
  normal: 250,
  slow: 400,
};

// Common Component Styles
export const componentStyles = {
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    ...shadows.md,
  },
  button: {
    primary: {
      backgroundColor: colors.primary[500],
      borderRadius: borderRadius.lg,
      paddingVertical: spacing[4],
      paddingHorizontal: spacing[6],
    },
    secondary: {
      backgroundColor: colors.background.secondary,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.primary[500],
      paddingVertical: spacing[4],
      paddingHorizontal: spacing[6],
    },
  },
  input: {
    backgroundColor: colors.gray[100],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    fontSize: typography.fontSize.md,
  },
  header: {
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
};

// Status Badge Config
export const statusConfig = {
  active: {
    bg: colors.success.light,
    text: colors.success.dark,
    dot: colors.success.main,
  },
  pending: {
    bg: colors.warning.light,
    text: colors.warning.dark,
    dot: colors.warning.main,
  },
  error: {
    bg: colors.error.light,
    text: colors.error.dark,
    dot: colors.error.main,
  },
  info: {
    bg: colors.info.light,
    text: colors.info.dark,
    dot: colors.info.main,
  },
};

export default {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  animations,
  componentStyles,
  statusConfig,
};
