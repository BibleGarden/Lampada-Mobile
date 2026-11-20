// Design tokens carried over from the original Claude Design prototype.
// The prototype file itself is gone from the repo: the UI has long moved on.

import { useMemo } from 'react';
import { Dimensions, useWindowDimensions } from 'react-native';

// The prototype is laid out in a 294×654 frame (a 320 "phone" screen minus a
// 13+13 bezel). Real screens are wider, so every prototype size scales
// proportionally to the screen width; growth is capped on tablets.
const PROTO_WIDTH = 294;

// Token growth caps. On phones, 460 keeps buttons and type from bloating on
// "plus" models. On tablets the column spans the full width, and the phone cap
// left lines at 80+ characters — hard to read; the higher cap scales indents
// and buttons along with the font, preserving the layout's proportions.
const SCALE_CAP_PHONE = 460;
const SCALE_CAP_TABLET = 620;

// The second scale anchor is the window height. Screens are portrait, so the
// prototype frame squeezes by height more easily than it stretches: 500
// instead of the original 654 is the shortest frame where the layout still
// breathes (iPhone SE, 667 pt at the width-based scale). The width-based scale
// stays leading on all portrait screens; in landscape, where the width is
// triple the needed height, the height takes over the limiting: the
// composition stays the same, just smaller, instead of bloated and cut off at
// the bottom.
const PROTO_MIN_HEIGHT = 500;

type Geometry = { scale: number; isTablet: boolean };

const geometryFor = (width: number, height: number): Geometry => {
  // A tablet is detected by its short side — it does not change on rotation,
  // so the layout type stays the same in portrait and landscape.
  const tablet = Math.min(width, height) >= 600;
  return {
    scale: Math.min(
      Math.min(width, tablet ? SCALE_CAP_TABLET : SCALE_CAP_PHONE) / PROTO_WIDTH,
      height / PROTO_MIN_HEIGHT,
    ),
    isTablet: tablet,
  };
};

const initial = Dimensions.get('window');
let geometry = geometryFor(initial.width, initial.height);

// The listener updates geometry before the first render after a window change:
// `useWindowDimensions` inside components then fires on fresh tokens.
Dimensions.addEventListener('change', ({ window }) => {
  geometry = geometryFor(window.width, window.height);
});

/** prototype px → pt on the current screen (0.5 step for crisp lines) */
export const sc = (v: number) => Math.round(v * geometry.scale * 2) / 2;
/**
 * A hitSlop that grows a side of `size` (in pt) to 44 pt — the HIG minimum
 * touch target. Meant for compact buttons: on iPhone SE, sc(32) is 41 pt.
 */
export const touchSlop = (size: number) => Math.max(0, Math.ceil((44 - size) / 2));
/** Tablet layout. A function, not a constant: depends on the current window. */
export const isTablet = () => geometry.isTablet;

/**
 * Rebuilds styles when the window geometry changes — rotation, Split View,
 * Stage Manager. `StyleSheet.create` freezes numbers at call time, so the
 * style factory must run inside the render, not at module level.
 */
export function useStyles<T>(factory: () => T): T {
  const { width, height } = useWindowDimensions();
  return useMemo(() => {
    geometry = geometryFor(width, height);
    return factory();
  }, [width, height, factory]);
}

/**
 * The content column. Its width is set in prototype units, not screen ones:
 * on a phone the cap is unreachable and changes nothing, while on a tablet it
 * keeps the line measure — otherwise in landscape, text and buttons stretch
 * across the whole window. A function, not a constant: depends on the current
 * geometry.
 */
export const column = () => ({
  width: '100%' as const,
  maxWidth: sc(360),
  alignSelf: 'center' as const,
});

/** A matching side gutter for the screen and its header inside the column. */
export const screenGutter = () => sc(18);

/** A shared width cap for bottom sheets on a wide window. */
export const sheetMaxWidth = () => column().maxWidth - 2 * screenGutter();

/** A uniform offset of the bottom action from the safe area. */
export const bottomActionPadding = (bottomInset: number) => bottomInset + sc(12);

export const colors = {
  // backgrounds
  bgHome: ['#2a1c0e', '#120b06', '#080604'] as const, // radial 85% 55% at 50% 52%
  bgScreen: ['#1a1510', '#100c08', '#0a0806'] as const, // radial 110% 70% at 50% 12%
  bgSheet: ['#1d1710', '#15100a'] as const,
  bgReader: ['#16241f', '#101b17'] as const,

  // accent — warm gold
  amber: '#e6a23c',
  amberDeep: '#c97f1f',
  amberBright: '#f0c074',
  gold: '#d9a94e',
  goldSoft: '#e7cf95',

  // text — by role, no extra shades:
  // cream — headings and questions; parchment — body text (fields, cards);
  // creamBright — large digits; creamDim — secondary lines;
  // labelGold — uppercase mono labels; warmHint — warm hints near buttons;
  // placeholder — input field placeholders.
  // Text token alphas are tuned for WCAG AA (≥4.5:1) on the lightest
  // backgrounds where they sit: a cardBg card over bgScreen and bgSheet
  cream: '#f3e6c8',
  creamBright: '#f6ecd4',
  creamDim: 'rgba(240,225,195,.65)',
  parchment: '#f2e9d6',
  ink: '#2a1a06', // text on gold buttons
  body: 'rgba(238,233,225,.82)',
  cardText: '#eef0e6',
  warmHint: 'rgba(240,200,140,.7)',
  placeholder: 'rgba(240,230,210,.55)',

  // utility
  white05: 'rgba(255,255,255,.05)',
  white08: 'rgba(255,255,255,.08)',
  white10: 'rgba(255,255,255,.1)',
  white50: 'rgba(255,255,255,.5)',
  white55: 'rgba(255,255,255,.55)',
  white65: 'rgba(255,255,255,.65)',
  labelGold: 'rgba(214,182,120,.72)',
  cardBorder: 'rgba(214,182,120,.42)',
  cardBg: 'rgba(214,182,120,.08)',
  btnGoldBg: 'rgba(214,182,120,.16)',
  btnGoldBorder: 'rgba(214,182,120,.34)',
  btnGoldBgDim: 'rgba(214,182,120,.1)',
  btnGoldBorderDim: 'rgba(214,182,120,.26)',
  green: '#7fd0a0',
  greenSoft: '#a9d3bd',
  orb: ['#d8f0e2', '#6fae93', '#2f6450'] as const,

  // flame
  flameCore: '#ffe9b8',
  flameMid: '#ffb24a',
  flameEdge: '#d6601a',
  haloGlow: 'rgba(230,140,40,.3)',
  bowlTop: '#5b432a',
  bowlBottom: '#2e2014',
} as const;

export const fonts = {
  serif: 'Spectral_300Light',
  serifRegular: 'Spectral_400Regular',
  serifSemiBold: 'Spectral_600SemiBold',
  serifItalic: 'Spectral_300Light_Italic',
  sans: 'HankenGrotesk_400Regular',
  sansMedium: 'HankenGrotesk_500Medium',
  sansSemiBold: 'HankenGrotesk_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

// Getters, not frozen objects: values depend on the current geometry.
export const radius = {
  get sm() {
    return sc(8);
  },
  get md() {
    return sc(14);
  },
  pill: 999,
};

// uppercase label in the prototype style
export const kicker = {
  fontFamily: fonts.mono,
  get fontSize() {
    return sc(10);
  },
  get letterSpacing() {
    return sc(1.6);
  },
  textTransform: 'uppercase' as const,
  color: colors.labelGold,
};

export const durations = {
  screenIn: 500,
  cardIn: 350,
  holdToStart: 1350,
} as const;
