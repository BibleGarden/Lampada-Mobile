// Плотности экрана рефлексии: сначала кегль вопроса, затем уголёк и поле.
// Значения в единицах макета; sc() применяется в компоненте и при подборе.
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

// Общие интервалы для стилей экрана и расчёта занимаемой высоты.
export const REFLECT_SPACING = { top: 16, question: 4, input: 20, actions: 16 } as const;

export type ReflectFitState = { context: string; index: number };
export type ReflectMeasurement = ReflectFitState & { blockHeight: number };

// Новый вопрос или геометрия начинают подбор сразу, без эффекта сброса.
export function reflectionDensityIndex(state: ReflectFitState, context: string): number {
  return state.context === context ? state.index : 0;
}

// Размеры берутся из одного нативного контейнера, а не из Dimensions.
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
 * Новый кегль измеряется заново: перенос может убрать целую строку.
 * Варианты с тем же кеглем подбираются сразу по измеренной высоте текста.
 * overflow неизвестен, пока нет подходящего измерения или скрытой клавиатуры.
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
