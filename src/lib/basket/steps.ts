export type StepId = "basket" | "contact" | "shipping" | "billing" | "review";

export interface StepDef {
  id: StepId;
  labelKey: string;
}

/** Every step in order; a layout shows the subset `layoutSteps` picks. */
export const STEPS: readonly StepDef[] = [
  { id: "basket", labelKey: "checkout.steps.basket" },
  { id: "contact", labelKey: "checkout.steps.contact" },
  { id: "shipping", labelKey: "checkout.steps.shipping" },
  { id: "billing", labelKey: "checkout.steps.billing" },
  { id: "review", labelKey: "checkout.steps.review" },
];

/** Wide layouts show the basket in the summary column beside every step instead of as a step. */
export function layoutSteps(wide: boolean): readonly StepDef[] {
  if (wide) {
    return STEPS.filter((step) => step.id !== "basket");
  }

  return STEPS;
}

export function stepIndex(id: StepId): number {
  return STEPS.findIndex((step) => step.id === id);
}

/** The layout's own step for `id`: itself, or the first layout step after it. */
export function stepIn(steps: readonly StepDef[], id: StepId): StepId {
  return steps.find((step) => stepIndex(step.id) >= stepIndex(id))?.id ?? steps[0].id;
}

export function nextStep(steps: readonly StepDef[], id: StepId): StepId | undefined {
  return steps.find((step) => stepIndex(step.id) > stepIndex(id))?.id;
}

export function previousStep(steps: readonly StepDef[], id: StepId): StepId | undefined {
  return steps.findLast((step) => stepIndex(step.id) < stepIndex(id))?.id;
}

/** The step's URL-hash fragment is its id, the same across locales. */
export function stepFromHash(hash: string): StepId | undefined {
  return STEPS.find((step) => step.id === hash)?.id;
}
