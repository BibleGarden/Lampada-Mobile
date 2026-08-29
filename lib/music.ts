import type { AudioSource } from 'expo-audio';
import { prayerTrackOrder } from './musicOrder';

export type PrayerTrack = {
  id: string;
  title: string;
  artist: string;
  source: AudioSource;
};

// Статические require обязательны: Metro должен обнаружить все локальные
// аудиофайлы при сборке, чтобы музыка работала полностью без сети.
export const PRAYER_TRACKS: readonly PrayerTrack[] = [
  {
    id: 'contemplation',
    title: 'Contemplation',
    artist: 'Joth',
    source: require('../assets/audio/contemplation.mp3'),
  },
  {
    id: 'galactic-temple',
    title: 'Galactic Temple',
    artist: 'yd',
    source: require('../assets/audio/galactic-temple.mp3'),
  },
  {
    id: 'november-snow',
    title: 'November Snow',
    artist: 'The Cynic Project',
    source: require('../assets/audio/november-snow.mp3'),
  },
  {
    id: 'another-august',
    title: 'Another August',
    artist: 'The Cynic Project',
    source: require('../assets/audio/another-august.mp3'),
  },
  {
    id: 'calm-relax',
    title: 'Calm Relax 1',
    artist: 'The Cynic Project',
    source: require('../assets/audio/calm-relax.mp3'),
  },
  {
    id: 'calm-piano',
    title: 'Calm Piano 1',
    artist: 'The Cynic Project',
    source: require('../assets/audio/calm-piano.mp3'),
  },
  {
    id: 'calm-ambient-3',
    title: 'Calm Ambient 3',
    artist: 'The Cynic Project',
    source: require('../assets/audio/calm-ambient-3.mp3'),
  },
  {
    id: 'calm-ambient-1',
    title: 'Calm Ambient 1',
    artist: 'The Cynic Project',
    source: require('../assets/audio/calm-ambient-1.mp3'),
  },
  {
    id: 'up-in-the-sky',
    title: 'Up in the Sky',
    artist: 'Memoraphile',
    source: require('../assets/audio/up-in-the-sky.mp3'),
  },
  {
    id: 'aquaria',
    title: 'Aquaria',
    artist: 'The Cynic Project',
    source: require('../assets/audio/aquaria.mp3'),
  },
  {
    id: 'birds-and-wind',
    title: 'Birds and Wind',
    artist: 'Spring Spring',
    source: require('../assets/audio/birds-and-wind.mp3'),
  },
  {
    id: 'first-light-particles',
    title: 'First Light Particles',
    artist: 'Yoiyami',
    source: require('../assets/audio/first-light-particles.mp3'),
  },
  {
    id: 'budding-consciousness',
    title: 'The Budding of Consciousness',
    artist: 'Yoiyami',
    source: require('../assets/audio/budding-consciousness.mp3'),
  },
  {
    id: 'slow-piano-intermission',
    title: 'Slow Piano Intermission',
    artist: 'Spring Spring',
    source: require('../assets/audio/slow-piano-intermission.mp3'),
  },
  {
    id: 'egyptian-meditation',
    title: 'Egyptian Meditation Music',
    artist: 'brandon75689',
    source: require('../assets/audio/egyptian-meditation.mp3'),
  },
];

export const PRAYER_TRACK_SOURCES: AudioSource[] = PRAYER_TRACKS.map(
  (track) => track.source,
);

let previousStartingTrack: number | null = null;

/**
 * Начинает каждую новую молитву со случайного трека, не повторяя стартовый
 * трек предыдущей сессии. Остальные композиции продолжают играть по кругу.
 */
export function getPrayerTracks(): PrayerTrack[] {
  const order = prayerTrackOrder(PRAYER_TRACK_SOURCES.length, previousStartingTrack);
  previousStartingTrack = order[0] ?? null;
  return order.map((index) => PRAYER_TRACKS[index]);
}
