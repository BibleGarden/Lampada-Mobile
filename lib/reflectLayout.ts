// Reflect screen densities: first the question type size, then the flame and
// the input. Values are in layout units; sc() is applied in the component and
// during fitting.
export const REFLECT_DENSITIES = [
  { fontStep: 0, flame: 104, input: 128 },
  { fontStep: 2, flame: 104, input: 128 },
  { fontStep: 4, flame: 104, input: 128 },
  { fontStep: 4, flame: 88, input: 128 },
  { fontStep: 4, flame: 72, input: 104 },
  { fontStep: 4, flame: 72, input: 72 },
] as const;

export function reflectionQuestionType(question: string, fontStep = 0) {
  const base = question.length > 110 ? { font: 18, line: 24 }
    : question.length > 75 ? { font: 20, line: 26 }
      : { font: 22, line: 29 };
  return { font: base.font - fontStep, line: base.line - fontStep };
}

// Shared spacing for screen styles and the occupied-height calculation.
export const REFLECT_SPACING = { top: 16, question: 4, input: 20, actions: 16 } as const;

export type ReflectFitState = { context: string; index: number };
export type ReflectMeasurement = ReflectFitState & { blockHeight: number };

// A new question or geometry restarts fitting immediately, with no reset effect.
export function reflectionDensityIndex(state: ReflectFitState, context: string): number {
  return state.context === context ? state.index : 0;
}

// Sizes come from a single native container, not from Dimensions.
export function reflectionAvailableHeight(
  rootHeight: number | undefined, topPadding: number, bottomPadding: number, bottomInset: number,
): number | undefined {
  return rootHeight === undefined ? undefined : rootHeight - topPadding - bottomPadding - bottomInset;
}

type Measured = {
  availableHeight: number | undefined;
  context: string;
  index: number;
  measurement: ReflectMeasurement | undefined;
  actionsHeight: number | undefined;
  keyboardPhase: 'hidden' | 'opening' | 'open' | 'closing';
};

/**
 * A new type size is measured anew: a reflow can remove a whole line.
 * Variants sharing the same type size are fitted at once from the measured
 * text height. overflow stays unknown until there is a matching measurement
 * and the keyboard is hidden.
 */
export function fitReflectDensity(
  { availableHeight, context, index, measurement, actionsHeight, keyboardPhase }: Measured,
  sc: (v: number) => number,
): { index: number; overflow: boolean | undefined } {
  if (keyboardPhase !== 'hidden' || availableHeight === undefined || measurement === undefined || actionsHeight === undefined
    || measurement.context !== context || measurement.index !== index) {
    return { index, overflow: undefined };
  }
  const density = REFLECT_DENSITIES[index];
  for (let next = index; next < REFLECT_DENSITIES.length; next++) {
    const candidate = REFLECT_DENSITIES[next];
    if (candidate.fontStep !== density.fontStep) return { index: next, overflow: undefined };
    const requiredHeight = sc(candidate.flame) + sc(REFLECT_SPACING.question)
      + measurement.blockHeight + sc(REFLECT_SPACING.input) + sc(candidate.input)
      + sc(REFLECT_SPACING.actions) + actionsHeight;
    if (requiredHeight <= availableHeight) return { index: next, overflow: false };
  }
  return { index: REFLECT_DENSITIES.length - 1, overflow: true };
}
