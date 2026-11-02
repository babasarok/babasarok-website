import type { ProductDefinition } from "@babasarok/product-definition";
import { unknownThreadColorRejection } from "../product/thread-color";
import { lengthMissingRejection, nonOrderableRejection } from "./line-price";
import { referencedMaterialIds, selectionsRejection } from "./selection-validation";
import { parseLineSelections, LineSelectionsError, type LineSelections } from "./line-selection";

/** The data a line check needs; the interceptor backs it with the database. */
export interface LineFacts {
  generatedDefinition(productId: number): Promise<ProductDefinition | undefined>;
  productName(productId: number, definition: ProductDefinition): Promise<string>;
  materialColors(materialSlugs: string[]): Promise<Map<string, Set<string>>>;
  knownThreadColors(colorIds: string[]): Promise<Set<string>>;
}

export interface LineCheckInput {
  productId: number;
  languageCode: string;
  customFields: { lengthCm?: unknown; selections?: unknown } | undefined;
  storedLengthCm?: unknown;
}

function isValidLength(lengthCm: unknown): boolean {
  return typeof lengthCm === "number" && Number.isInteger(lengthCm) && lengthCm > 0;
}

async function selectionsError(
  facts: LineFacts,
  input: LineCheckInput,
  definition: ProductDefinition | undefined
): Promise<string | undefined> {
  let selections: LineSelections;

  try {
    selections = parseLineSelections(input.customFields?.selections);
  } catch (error) {
    if (error instanceof LineSelectionsError) {
      return error.message;
    }

    throw error;
  }

  if (definition !== undefined) {
    const rejection = selectionsRejection({
      definition,
      productName: await facts.productName(input.productId, definition),
      selections,
      materialColors: await facts.materialColors(referencedMaterialIds(selections)),
      languageCode: input.languageCode,
    });

    if (rejection !== undefined) {
      return rejection;
    }
  }

  const colorIds = new Set(
    Object.values(selections).flatMap((selection) =>
      selection?.kind === "embroidery" ? [selection.colorId] : []
    )
  );

  if (colorIds.size === 0) {
    return undefined;
  }

  const known = await facts.knownThreadColors([...colorIds]);
  const unknown = [...colorIds].filter((colorId) => !known.has(colorId));

  if (unknown.length > 0) {
    return unknownThreadColorRejection(unknown);
  }

  return undefined;
}

/**
 * The rejection for a line being added or adjusted, or undefined when it is
 * acceptable. `storedLengthCm` is the adjusted line's current length: the
 * mutation merges incoming custom fields over it.
 */
export async function lineRejection(
  facts: LineFacts,
  input: LineCheckInput
): Promise<string | undefined> {
  const definition = await facts.generatedDefinition(input.productId);

  if (definition !== undefined && !definition.orderable) {
    return nonOrderableRejection(await facts.productName(input.productId, definition));
  }

  if (definition === undefined || definition.pricing.kind !== "length") {
    return selectionsError(facts, input, definition);
  }

  const provided = input.customFields?.lengthCm;
  const lengthCm = typeof provided === "number" ? provided : input.storedLengthCm;

  if (!isValidLength(lengthCm)) {
    return lengthMissingRejection(await facts.productName(input.productId, definition));
  }

  return selectionsError(facts, input, definition);
}
