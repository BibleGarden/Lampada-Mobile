export type KeyboardCoordinates = { height: number; width: number };
export type KeyboardPhase = 'hidden' | 'opening' | 'open' | 'closing';
export type KeyboardState = { coordinates: KeyboardCoordinates | null; phase: KeyboardPhase };
export type KeyboardSignal =
  | { type: 'show'; coordinates: KeyboardCoordinates; settled: boolean }
  | { type: 'frame'; coordinates: KeyboardCoordinates }
  | { type: 'willHide' | 'hide' };

export const hiddenKeyboard: KeyboardState = { coordinates: null, phase: 'hidden' };

export function updateKeyboardState(state: KeyboardState, signal: KeyboardSignal): KeyboardState {
  switch (signal.type) {
    case 'show': return { coordinates: signal.coordinates, phase: signal.settled ? 'open' : 'opening' };
    case 'frame': return state.phase === 'hidden' ? state : { ...state, coordinates: signal.coordinates };
    case 'willHide': return state.phase === 'hidden' ? state : { ...state, phase: 'closing' };
    case 'hide': return hiddenKeyboard;
  }
}

// A floating Android keyboard is visible but occupies no window band:
// the IME inset is at most the system bar, and React Native reports a
// height <= 0. A narrow floating iPad keyboard can report a non-zero
// height, so on iOS its width is compared with the docked keyboard width
// (dockedWidth). On Android the width is not compared (null): React Native
// reports the visible window width there, not the IME's. It says nothing
// about a floating keyboard and goes stale after a window-width-only
// change (unfolding a Fold, split screen), because keyboardDidShow is not
// repeated then.
export function keyboardLayoutFor(state: KeyboardState, dockedWidth: number | null) {
  const { coordinates, phase } = state;
  const visible = phase !== 'hidden';
  const docked = visible && coordinates !== null && coordinates.height > 0
    && (dockedWidth === null || coordinates.width >= dockedWidth - 1);
  return {
    visible,
    phase,
    kind: !visible ? 'hidden' as const : docked ? 'docked' as const : 'floating' as const,
  };
}

export type KeyboardLayout = ReturnType<typeof keyboardLayoutFor>;

// The field fills the form while a docked keyboard is opening or open.
// A closing keyboard no longer holds the editing layout: when hiding
// starts, the whole form, deferred actions included, returns to the normal
// layout instead of stretching the field into the freed space and
// rebuilding a second time after keyboardDidHide. The viewport reserve
// follows the keyboard down, so the actions ride above it. Focus loss or a
// zero keyboard height does not restore the actions: only the keyboard
// phase decides.
export function keyboardFormPolicy(layout: KeyboardLayout) {
  const showing = keyboardShowing(layout);
  return {
    fillInput: layout.kind === 'docked' && showing,
    actionsVisible: !showing,
  };
}

// The form and the sheet need the keyboard while it is opening or open.
// A closing one (iOS keyboardWillHide) is already unneeded: the sheet
// returns to its home position along with it, not in a separate move
// after keyboardDidHide. Android reports hiding at the start of the
// animation, so there is no closing phase there.
export function keyboardShowing(layout: KeyboardLayout) {
  return layout.phase === 'opening' || layout.phase === 'open';
}

// The answer-sheet snap the keyboard demands: 1 — full height, 0 — return
// to the home position, null — the person chooses the snap.
export type KeyboardSnap = 0 | 1 | null;

export function keyboardSnapTarget(current: KeyboardSnap, form: {
  open: boolean;
  keyboardShowing: boolean;
  inputFocused: boolean;
  recording: boolean;
}): KeyboardSnap {
  if (!form.open) return null;
  if (form.keyboardShowing && form.inputFocused) return 1;
  if (current === null) return null;
  // Do not lower the sheet after a recording has started.
  return form.recording ? null : 0;
}

// The request that re-checks the target when the keyboard or focus
// changes. The target is not compared with the sheet index: on the JS
// thread it lags behind the animation. Returning to the home position is a
// one-shot request: afterwards the person picks the snap again, including
// by gesture. While the person holds the handle, the return waits for the
// release (keyboardSnapOnHandleRelease).
export function reconcileKeyboardSnap(target: KeyboardSnap, handlePressed = false): {
  request: number | null;
  target: KeyboardSnap;
} {
  if (target === 0 && handlePressed) return { request: null, target };
  return { request: target, target: target === 0 ? null : target };
}

// Touching the handle hides the keyboard. A plain tap behaves like any
// dismissal — the sheet returns to its home position; dragging leaves the
// snap to the person, and the keyboard request does not fight their
// gesture.
export function keyboardSnapOnHandleRelease(target: KeyboardSnap, dragged: boolean): {
  request: number | null;
  target: KeyboardSnap;
} {
  return dragged ? { request: null, target: null } : reconcileKeyboardSnap(target);
}

// Re-requests full height when the sheet has settled below it. Gorhom
// discards a request for the point the current animation is heading to,
// even when an earlier request, not yet on the UI thread, changes that
// point. So on a fast IME switch the full-height request can get lost, and
// the target is re-checked every time the sheet settles — including at the
// previous point, which Gorhom reports through neither onChange nor
// onAnimate.
export function settledKeyboardSnapRequest(target: KeyboardSnap, index: number): number | null {
  return target === 1 && index >= 0 && index !== 1 ? 1 : null;
}

// The height the form reserves under the keyboard. Whether a docked
// keyboard is visible is decided by the React Native classifier
// (keyboardLayoutFor), while Keyboard Controller only provides animation
// frames. After a fast IME switch Keyboard Controller may not update the
// height, so without the classifier it would leave a phantom gap. On
// Android the classifier sees hiding at the very start of the animation,
// so while the animation runs the reserve follows the keyboard down. A
// floating keyboard occupies no window band.
export function reservedKeyboardHeight(kind: KeyboardLayout['kind'], moving: boolean, height: number): number {
  'worklet';
  return kind === 'docked' || (kind === 'hidden' && moving) ? Math.max(0, height) : 0;
}

// The band an opening keyboard will still claim in the KeyboardViewport:
// the reserve the animation will end with, minus the current reserve (both
// at least the safe area). The field filling the form above the docked
// keyboard stands above this band and thus has its final height from the
// first frame: the keyboard rises into an empty band instead of squeezing
// the multiline field frame by frame. A closing keyboard leaves no band —
// its target is lower.
export function pendingKeyboardReserve(safeBottom: number, reserved: number, target: number): number {
  'worklet';
  return Math.max(0, Math.max(safeBottom, target) - Math.max(safeBottom, reserved));
}

// The sheet footer position (from the top of its content) lifted above the
// keyboard. The keyboard must not take away the whole body: Android drops
// focus from a field whose ancestor has collapsed to zero
// (View.sizeChange), and typing goes nowhere. So the lift stops at the
// minimum body height even when the keyboard is taller (full-screen IME, a
// low snap point on a small screen). A closing sheet already below this
// minimum rides down together with the footer.
export function sheetFooterPosition(natural: number, keyboard: number, safeBottom: number, minBody: number): number {
  'worklet';
  const lifted = natural - Math.max(0, keyboard - safeBottom);
  return Math.max(0, lifted, Math.min(natural, minBody));
}

// The sheet body height above the footer. The footer moves via a
// frame-by-frame transform, while the body height is a layout of the whole
// content with the multiline field, so it changes once at the start of
// each transition: the body immediately takes the height it will have
// above the footer once the sheet and the keyboard reach their targets.
// While the footer travels there, it slides toward the already-sized field
// or covers with the sheet background the part of the body it has not
// opened yet; nothing changes at the end of the transition. Until Gorhom
// has measured the handle and the footer (negative sizes), there is no
// body yet.
export type SheetLayout = { containerHeight: number; handleHeight: number; footerHeight: number };

// The footer position Gorhom gives the sheet at position `position`
// (BottomSheetFooterContainer) — without the keyboard lift.
export function naturalFooterPosition(layout: SheetLayout, position: number): number {
  'worklet';
  const { containerHeight, handleHeight, footerHeight } = layout;
  if (handleHeight < 0 || footerHeight < 0) return 0;
  return Math.max(0, containerHeight - position) - footerHeight - handleHeight;
}

// A moving sheet's target is the position its animation is heading to
// (Gorhom's nextPosition); a settled sheet uses its current one. Closing
// and the person's gesture do not rebuild the body (null): a closing sheet
// slides away with its content, and a gesture's target becomes known only
// when, after release, Gorhom starts animating toward a point.
export type SheetMotion = { position: number; nextIndex?: number; nextPosition?: number; dragging: boolean };

export function sheetBodyHeight(
  layout: SheetLayout, sheet: SheetMotion, keyboardTarget: number, safeBottom: number, minBody: number,
  keyboardSnapPosition?: number,
  keyboardReserved = 0,
  keyboardRestFraction?: number,
): number | null {
  'worklet';
  if (sheet.dragging || sheet.nextIndex === -1) return null;
  // Keyboard Controller's UI-thread target precedes Gorhom's JS snap request.
  // Use the pending keyboard snap now so the field does not shrink at rest.
  let target = sheet.nextPosition ?? sheet.position;
  if (keyboardTarget > 0 && keyboardSnapPosition !== undefined) {
    target = keyboardSnapPosition;
  } else if (keyboardTarget === 0 && keyboardReserved > 0 && keyboardRestFraction !== undefined) {
    target = layout.containerHeight * keyboardRestFraction;
  }
  return sheetFooterPosition(naturalFooterPosition(layout, target), keyboardTarget, safeBottom, minBody);
}
