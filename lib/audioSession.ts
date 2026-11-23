import { setIsAudioActiveAsync } from 'expo-audio';
import { createAudioModeCoordinator } from './audioModeCoordinator';

// Expo's audio-session mode and activity are process-wide, so the app has
// a single coordinator.
export const audioModeCoordinator = createAudioModeCoordinator(setIsAudioActiveAsync);
