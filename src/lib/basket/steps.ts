export type StepId = "contact" | "shipping" | "billing" | "review";

export interface StepDef {
  id: StepId;
  labelKey: string;
}

/** The step list is data: epic 7 inserted Számlázás without a redesign. */
export const STEPS: readonly StepDef[] = [
  { id: "contact", labelKey: "checkout.steps.contact" },
  { id: "shipping", labelKey: "checkout.steps.shipping" },
  { id: "billing", labelKey: "checkout.steps.billing" },
  { id: "review", labelKey: "checkout.steps.review" },
];

export function stepIndex(id: StepId): number {
  return STEPS.findIndex((step) => step.id === id);
}

/** The step's URL-hash fragment is its id, the same across locales. */
export function stepFromHash(hash: string): StepId | undefined {
  return STEPS.find((step) => step.id === hash)?.id;
}
