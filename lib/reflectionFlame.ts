export function shouldPauseReflectionFlame(videoFlag: string | undefined, inputFocused: boolean): boolean {
  return videoFlag === '1' && inputFocused;
}
