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

type Measured = {
  availableHeight: number;
  questionBlockHeight: number;
  questionLines: number;
  actionsHeight: number;
  question: string;
  densityIndex: number;
};

/** Первый вариант, в котором весь экран помещается без прокрутки. */
export function fitReflectDensity(
  { availableHeight, questionBlockHeight, questionLines, actionsHeight, question, densityIndex }: Measured,
  sc: (v: number) => number,
): { index: number; overflow: boolean } {
  const measuredLine = reflectionQuestionType(question, REFLECT_DENSITIES[densityIndex].fontStep).line;
  const nonQuestionHeight = questionBlockHeight - questionLines * sc(measuredLine);
  const fits = ({ fontStep, flame, input }: (typeof REFLECT_DENSITIES)[number]) =>
    sc(flame) + sc(4) + nonQuestionHeight
    + questionLines * sc(reflectionQuestionType(question, fontStep).line)
    + sc(20) + sc(input) + sc(16) + actionsHeight <= availableHeight;
  const index = REFLECT_DENSITIES.findIndex(fits);
  return index >= 0
    ? { index, overflow: false }
    : { index: REFLECT_DENSITIES.length - 1, overflow: true };
}
