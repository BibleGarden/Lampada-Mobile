import type { AudioSource } from 'expo-audio';

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
];

export const PRAYER_TRACK_SOURCES: AudioSource[] = PRAYER_TRACKS.map(
  (track) => track.source,
);
