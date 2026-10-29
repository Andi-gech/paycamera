// lib/theme.ts — Impeccable Design System Tokens for ልክ pay
export const Theme = {
  light: {
    // Spatial & Ground Layer
    ground: '#F8FAFC',           // Pure slate background
    surface: '#FFFFFF',          // High-contrast clean card surface
    surfaceSubtle: '#F1F5F9',    // Secondary neutral layer for subtle insets
    border: '#E2E8F0',           // 1px hairline structural line
    borderFocus: '#059669',      // LikPay green focus boundary

    // Typography Ink
    ink: '#0F172A',              // Primary deep slate-black (contrast > 10:1)
    inkMuted: '#475569',         // Secondary descriptive text (contrast > 5.5:1)
    inkFaint: '#94A3B8',         // Subtle metadata and caption labels

    // Purposeful Accent Color (LikPay Brand Payment Green)
    accent: '#059669',           // LikPay brand emerald green (contrast > 4.5:1)
    accentHover: '#047857',      // Pressed / active state
    accentSubtle: '#ECFDF5',     // Soft emerald wash for active states & badges

    // Semantic States
    success: '#059669',          // Official bank match confirmed
    successSurface: '#ECFDF5',
    error: '#DC2626',            // Mismatch or unverified alert
    errorSurface: '#FEF2F2',

    // Navigation & App Shell
    tabGround: '#FFFFFF',
    tabBorder: '#E2E8F0',

    // Backward-compatible aliases
    background: '#F8FAFC',
    surfaceBorder: '#E2E8F0',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textTertiary: '#94A3B8',
    primaryBlue: '#059669',
    primaryLight: '#ECFDF5',
    inputBg: '#FFFFFF',
    inputBorder: '#CBD5E1',
    cardBg: '#FFFFFF',
    divider: '#F1F5F9',
    tabBg: '#FFFFFF',
  },
  dark: {
    // Spatial & Ground Layer — OLED Pure Actual Black
    ground: '#000000',           // Pure pitch black background (0 lux OLED)
    surface: '#0E0E0E',          // Deep black card surface with razor elevation
    surfaceSubtle: '#181818',    // Inset tier for segmented tabs, pill badges, and search inputs
    border: '#242424',           // Hairline boundary
    borderFocus: '#10B981',

    // Typography Ink
    ink: '#FFFFFF',              // Crisp white primary text
    inkMuted: '#A1A1AA',         // Neutral zinc secondary text
    inkFaint: '#71717A',         // Subtle metadata and caption labels

    // Purposeful Accent Color (LikPay Brand Payment Green)
    accent: '#10B981',           // Luminous readable emerald green
    accentHover: '#059669',
    accentSubtle: '#062615',     // Deep dark emerald wash

    // Semantic States
    success: '#10B981',
    successSurface: '#062615',   // Deep dark emerald
    error: '#F87171',
    errorSurface: '#2B0E0E',     // Deep dark crimson

    // Navigation & App Shell
    tabGround: '#000000',        // Pure black bottom tab bar
    tabBorder: '#1A1A1A',        // Hairline boundary

    // Backward-compatible aliases
    background: '#000000',
    surfaceBorder: '#242424',
    textPrimary: '#FFFFFF',
    textSecondary: '#A1A1AA',
    textTertiary: '#71717A',
    primaryBlue: '#10B981',
    primaryLight: '#062615',
    inputBg: '#0E0E0E',
    inputBorder: '#262626',
    cardBg: '#0E0E0E',
    divider: '#1A1A1A',
    tabBg: '#000000',
  },
  radii: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    pill: 9999,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
};

export const Colors = Theme.light;
export const Spacing = Theme.spacing;
export const Radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
};
export const FontSize = {
  xs: 11,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 22,
  xxxl: 28,
  display: 34,
};
export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};
export const Shadow = {
  sm: { elevation: 0 },
  md: { elevation: 1 },
  lg: { elevation: 2 },
};
