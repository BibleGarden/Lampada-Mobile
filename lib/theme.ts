// Дизайн-токены, перенесённые из прототипа (Прототип.dc.html)

import { Dimensions } from 'react-native';

// Прототип свёрстан в кадре 294×654 (экран «телефона» 320 минус рамка 13+13).
// Реальные экраны шире, поэтому каждый размер из прототипа масштабируется
// пропорционально ширине экрана; на планшетах рост ограничен.
const PROTO_WIDTH = 294;
export const scale = Math.min(Dimensions.get('window').width, 460) / PROTO_WIDTH;
/** px из прототипа → pt на текущем экране (шаг 0.5 для чёткости линий) */
export const sc = (v: number) => Math.round(v * scale * 2) / 2;

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

  // текст — по ролям, не плодить оттенки:
  // cream — заголовки и вопросы; parchment — основной текст (поля, карточки);
  // creamBright — крупные цифры; creamDim — вторичные строки;
  // labelGold — mono-подписи капсом; warmHint — тёплые хинты у кнопок
  cream: '#f3e6c8',
  creamBright: '#f6ecd4',
  creamDim: 'rgba(240,225,195,.65)',
  parchment: '#f2e9d6',
  ink: '#2a1a06', // текст на золотых кнопках
  body: 'rgba(238,233,225,.82)',
  cardText: '#eef0e6',
  warmHint: 'rgba(240,200,140,.7)',

  // служебные
  white05: 'rgba(255,255,255,.05)',
  white08: 'rgba(255,255,255,.08)',
  white10: 'rgba(255,255,255,.1)',
  white50: 'rgba(255,255,255,.5)',
  white55: 'rgba(255,255,255,.55)',
  white65: 'rgba(255,255,255,.65)',
  labelGold: 'rgba(214,182,120,.68)',
  labelGoldDim: 'rgba(214,182,120,.5)',
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

export const radius = { sm: sc(8), md: sc(14), pill: 999 } as const;

// подпись капсом в стиле прототипа
export const kicker = {
  fontFamily: fonts.mono,
  fontSize: sc(10),
  letterSpacing: sc(1.6),
  textTransform: 'uppercase' as const,
  color: colors.labelGold,
};

export const durations = {
  screenIn: 500,
  cardIn: 350,
  holdToStart: 1350,
} as const;
