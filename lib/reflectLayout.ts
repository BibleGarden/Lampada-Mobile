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

type Measured = {
  availableHeight: number;
  context: string;
  index: number;
  measurement: ReflectMeasurement | undefined;
  actionsHeight: number | undefined;
  keyboardPhase: 'hidden' | 'opening' | 'open' | 'closing';
};

/**
 * Проверяет только реально измеренный вариант. Следующий шаг измеряется
 * заново: меньший кегль может убрать целую строку, а не только её высоту.
 * Поэтому первый поместившийся шаг не пропускается из-за прогноза переноса.
 */
export function fitReflectDensity(
  { availableHeight, context, index, measurement, actionsHeight, keyboardPhase }: Measured,
  sc: (v: number) => number,
): { index: number; overflow: boolean } {
  if (keyboardPhase !== 'hidden' || measurement === undefined || actionsHeight === undefined
    || measurement.context !== context || measurement.index !== index) {
    return { index, overflow: false };
  }
  const density = REFLECT_DENSITIES[index];
  const requiredHeight = sc(density.flame) + sc(REFLECT_SPACING.question)
    + measurement.blockHeight + sc(REFLECT_SPACING.input) + sc(density.input)
    + sc(REFLECT_SPACING.actions) + actionsHeight;
  if (requiredHeight <= availableHeight) return { index, overflow: false };
  const next = Math.min(index + 1, REFLECT_DENSITIES.length - 1);
  return { index: next, overflow: next === index };
}
