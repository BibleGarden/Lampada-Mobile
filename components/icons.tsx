import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { sc } from '../lib/theme';

// Иконки из прототипа (лаконичный стиль stroke 1.7–2).
// size задаётся в px прототипа и масштабируется под экран через sc();
// штрих масштабируется сам вместе с viewBox.

type P = { size?: number; color?: string; strokeWidth?: number };

export const ChevronLeft = ({ size = 17, color = '#e7cf95', strokeWidth = 2 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 6l-6 6 6 6" />
  </Svg>
);

export const ChevronRight = ({ size = 17, color = '#e7cf95', strokeWidth = 2 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M9 6l6 6-6 6" />
  </Svg>
);

export const Plus = ({ size = 18, color = '#e7cf95', strokeWidth = 2 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);

export const Minus = ({ size = 18, color = '#e7cf95', strokeWidth = 2 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
    <Path d="M5 12h14" />
  </Svg>
);

export const Regen = ({ size = 18, color = '#e7cf95', strokeWidth = 1.9 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <Path d="M21 3v5h-5" />
    <Path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    <Path d="M3 21v-5h5" />
  </Svg>
);

export const Close = ({ size = 17, color = 'rgba(255,255,255,.55)', strokeWidth = 2 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
    <Path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const Check = ({ size = 15, color = '#a9d3bd', strokeWidth = 2 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M5 12l5 5L19 7" />
  </Svg>
);

// lucide pencil-line (v1.37.0, ISC)
export const Pen = ({ size = 15, color = '#e7cf95', strokeWidth = 1.7 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M13 21h8" />
    <Path d="m15 5 4 4" />
    <Path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
  </Svg>
);

export const QuestionMark = ({ size = 13, color = '#e7cf95', strokeWidth = 1.7 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={12} cy={12} r={9} />
    <Path d="M9.5 9.2a2.5 2.5 0 1 1 3.5 2.3c-.9.4-1.5 1-1.5 2.1" />
    <Path d="M12 17h.01" />
  </Svg>
);

export const Book = ({ size = 13, color = '#e7cf95', strokeWidth = 1.7 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M2 5.5C5 4 8 4 11 5.5v14C8 18 5 18 2 19.5z" />
    <Path d="M22 5.5C19 4 16 4 13 5.5v14c3-1.5 6-1.5 9 0z" />
  </Svg>
);

export const Heart = ({ size = 15, color = '#e7cf95', fill = 'none', strokeWidth = 1.7 }: P & { fill?: string }) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 20s-7-4.3-9.3-8.5C1 8 2.8 5 6 5c2 0 3.2 1.2 4 2.3C10.8 6.2 12 5 14 5c3.2 0 5 3 3.3 6.5C19 15.7 12 20 12 20z" />
  </Svg>
);

export const Music = ({ size = 16, color = 'rgba(255,255,255,.55)', strokeWidth = 1.7 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M9 18V5l10-2v13" />
    <Circle cx={6} cy={18} r={3} />
    <Circle cx={16} cy={16} r={3} />
  </Svg>
);

export const Mic = ({ size = 18, color = '#e7cf95', strokeWidth = 1.7 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={9} y={3} width={6} height={11} rx={3} />
    <Path d="M5 11a7 7 0 0 0 14 0" />
    <Path d="M12 18v3" />
  </Svg>
);

export const PlayIcon = ({ size = 14, color = '#e7cf95' }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill={color}>
    <Path d="M8 5v14l11-7z" />
  </Svg>
);

export const PauseIcon = ({ size = 14, color = '#e7cf95' }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill={color}>
    <Path d="M6 4h4v16H6zM14 4h4v16h-4z" />
  </Svg>
);

// «в текст» — расшифровка голосовой записи
export const TextLines = ({ size = 15, color = '#a9d3bd', strokeWidth = 1.7 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 6h16M4 12h16M4 18h9" />
  </Svg>
);

export const Trash = ({ size = 15, color = 'rgba(255,255,255,.5)', strokeWidth = 1.7 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </Svg>
);

export const Bell = ({ size = 13, color = 'rgba(255,255,255,.3)', strokeWidth = 1.7 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <Path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </Svg>
);

export const Gear = ({ size = 16, color = 'rgba(214,182,120,.68)', strokeWidth = 1.7 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <Circle cx={12} cy={12} r={3} />
  </Svg>
);

export const Clock = ({ size = 16, color = 'rgba(230,162,60,.85)', strokeWidth = 1.7 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 7v5l3 2" />
    <Path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
  </Svg>
);

export const Shield = ({ size = 16, color = 'rgba(230,162,60,.85)', strokeWidth = 1.7 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
    <Path d="M9.5 12l1.8 1.8 3.5-3.6" />
  </Svg>
);

export const Lamp = ({ size = 23, color = 'rgba(240,200,140,.85)', strokeWidth = 1.5 }: P) => (
  <Svg width={sc(size)} height={sc(size)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 3a6 6 0 0 0-6 6c0 2 1 3.3 2 4.5.7.8 1 1.5 1 2.5h6c0-1 .3-1.7 1-2.5 1-1.2 2-2.5 2-4.5a6 6 0 0 0-6-6z" />
    <Path d="M9.5 19h5" />
    <Path d="M10.5 21.5h3" />
  </Svg>
);
