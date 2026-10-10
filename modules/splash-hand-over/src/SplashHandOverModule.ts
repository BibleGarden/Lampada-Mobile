import { NativeModule, requireNativeModule } from 'expo';

declare class SplashHandOverModule extends NativeModule<{}> {
  waitAsync(): Promise<void>;
}

export default requireNativeModule<SplashHandOverModule>('SplashHandOver');
