import { setIsAudioActiveAsync } from 'expo-audio';
import { createAudioModeCoordinator } from './audioModeCoordinator';

// Режим и активность аудиосессии Expo глобальны для процесса, поэтому
// координатор у приложения один.
export const audioModeCoordinator = createAudioModeCoordinator(setIsAudioActiveAsync);
