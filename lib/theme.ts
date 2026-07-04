// Дизайн-токены, перенесённые из прототипа (Прототип.dc.html)

export const colors = {
  // фоны
  bgHome: ['#2a1c0e', '#120b06', '#080604'] as const, // radial 85% 55% at 50% 52%
  bgScreen: ['#1a1510', '#100c08', '#0a0806'] as const, // radial 110% 70% at 50% 12%
  bgSheet: ['#1d1710', '#15100a'] as const,
  bgReader: ['#16241f', '#101b17'] as const,

  // акцент — тёплое золото
  amber: '#e6a23c',
  amberDeep: '#c97f1f',
  amberBright: '#f0c074',
  gold: '#d9a94e',
  goldSoft: '#e7cf95',

  // текст
  cream: '#f3e6c8',
  creamDim: 'rgba(240,225,195,.55)',
  parchment: '#f1e6cf',
  ink: '#2a1a06', // текст на золотых кнопках
  body: 'rgba(238,233,225,.82)',
  cardText: '#eef0e6',

  // служебные
  white05: 'rgba(255,255,255,.05)',
  white08: 'rgba(255,255,255,.08)',
  white10: 'rgba(255,255,255,.1)',
  white30: 'rgba(255,255,255,.3)',
  white45: 'rgba(255,255,255,.45)',
  white55: 'rgba(255,255,255,.55)',
  white65: 'rgba(255,255,255,.65)',
  labelGold: 'rgba(214,182,120,.55)',
  labelGoldDim: 'rgba(214,182,120,.42)',
  cardBorder: 'rgba(214,182,120,.42)',
  cardBg: 'rgba(214,182,120,.08)',
  btnGoldBg: 'rgba(214,182,120,.16)',
  btnGoldBorder: 'rgba(214,182,120,.34)',
  btnGoldBgDim: 'rgba(214,182,120,.1)',
  btnGoldBorderDim: 'rgba(214,182,120,.26)',
  green: '#7fd0a0',
  greenSoft: '#a9d3bd',
  orb: ['#d8f0e2', '#6fae93', '#2f6450'] as const,

  // пламя
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
  serifItalic: 'Spectral_300Light_Italic',
  sans: 'HankenGrotesk_400Regular',
  sansMedium: 'HankenGrotesk_500Medium',
  sansSemiBold: 'HankenGrotesk_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

export const radius = { sm: 8, md: 14, pill: 999 } as const;

// подпись капсом в стиле прототипа
export const kicker = {
  fontFamily: fonts.mono,
  fontSize: 10,
  letterSpacing: 1.6,
  textTransform: 'uppercase' as const,
  color: colors.labelGold,
};

export const durations = {
  screenIn: 500,
  cardIn: 350,
  holdToStart: 1350,
} as const;
