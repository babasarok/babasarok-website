import {
  ProductDefinitionSchema,
  type ProductDefinition,
  type ProductField,
} from "@babasarok/product-definition";
import { dependencyOrder, isVisible } from "./field-visibility";

export type ProductDefinitionValidationResult =
  { success: true; definition: ProductDefinition } | { success: false; errors: string[] };

/** Field kinds whose buyer-facing value is a plain string (a numeric source candidate). */
const STRING_VALUED_FIELD_KINDS: ReadonlySet<ProductField["kind"]> = new Set(["input", "choice"]);

function stringValuedFieldIds(fields: readonly ProductField[]): Set<string> {
  return new Set(
    fields.filter((field) => STRING_VALUED_FIELD_KINDS.has(field.kind)).map((field) => field.id)
  );
}

function numericSourceErrors(
  where: string,
  sourceFieldId: string,
  fields: readonly ProductField[],
  fieldIds: ReadonlySet<string>,
  stringValuedIds: ReadonlySet<string>
): string[] {
  if (!fieldIds.has(sourceFieldId)) {
    return [`${where} nem létező mezőre hivatkozik: "${sourceFieldId}".`];
  }

  if (!stringValuedIds.has(sourceFieldId)) {
    return [`${where} ("${sourceFieldId}") olyan mezőre hivatkozik, ami nem adhat számértéket.`];
  }

  return [];
}

function duplicateEntryErrors(definition: ProductDefinition): string[] {
  const errors: string[] = [];

  for (const field of definition.fields) {
    if (field.kind === "choice") {
      const seen = new Set<string>();

      for (const option of field.options) {
        if (seen.has(option.id)) {
          errors.push(`${field.id}: duplikált opciókód: "${option.id}".`);
        }

        seen.add(option.id);
      }
    }

    if (field.kind === "material") {
      const seen = new Set<string>();

      for (const option of field.options) {
        if (seen.has(option.materialId)) {
          errors.push(`${field.id}: duplikált anyag: "${option.materialId}".`);
        }

        seen.add(option.materialId);
      }
    }
  }

  return errors;
}

/** One form-reachable configuration being priced during the 0-Ft walk. */
interface Configuration {
  /** Base price plus the parts chosen so far (all nonnegative, so it only grows). */
  price: number;
  /** The picks so far, `fieldId=value` — the error names the offending combination. */
  picks: string[];
  /** fieldId → chosen value, for `depends_on` visibility (absent = unchosen). */
  values: Map<string, string | boolean>;
  /** Chosen material ids so far, for forbidden-combination pruning. */
  materials: string[];
}

function coversRule(materials: readonly string[], rule: readonly string[]): boolean {
  const available = new Map<string, number>();

  for (const materialId of materials) {
    available.set(materialId, (available.get(materialId) ?? 0) + 1);
  }

  for (const materialId of rule) {
    const left = available.get(materialId) ?? 0;

    if (left === 0) {
      return false;
    }

    available.set(materialId, left - 1);
  }

  return true;
}

/**
 * The configurations `field` can contribute on top of `config`: one branch per
 * offered choice, mirroring the order form's reachability rules — choice
 * selections are required (a custom value where `customValue` is set counts as
 * a 0-Ft selection), a material pick is required and pruned when it would
 * complete a forbidden combination, a toggle covers both states, input fields
 * carry no value and never block, and embroidery is optional.
 */
function extend(
  definition: ProductDefinition,
  field: ProductField,
  sourceFieldId: string | undefined,
  config: Configuration
): Configuration[] {
  if (field.id === sourceFieldId) {
    return [config];
  }

  if (field.kind === "choice") {
    const branches = field.options.map((option) => ({
      ...config,
      price: config.price + option.price,
      picks: [...config.picks, `${field.id}=${option.id}`],
      values: new Map(config.values).set(field.id, option.id),
    }));

    if (field.customValue !== undefined) {
      branches.push({
        ...config,
        picks: [...config.picks, `${field.id}=__custom__`],
        values: new Map(config.values).set(field.id, "__custom__"),
      });
    }

    return branches;
  }

  if (field.kind === "toggle") {
    return [
      { ...config, values: new Map(config.values).set(field.id, false) },
      {
        ...config,
        price: config.price + field.price,
        picks: [...config.picks, `${field.id}=igen`],
        values: new Map(config.values).set(field.id, true),
      },
    ];
  }

  if (field.kind === "material") {
    return field.options
      .filter(
        (option) =>
          !definition.forbiddenMaterialCombinations.some((rule) =>
            coversRule([...config.materials, option.materialId], rule)
          )
      )
      .map((option) => ({
        ...config,
        price: config.price + option.price,
        picks: [...config.picks, `${field.id}=${option.materialId}`],
        values: new Map(config.values).set(field.id, option.materialId),
        materials: [...config.materials, option.materialId],
      }));
  }

  if (field.kind === "input") {
    return [{ ...config, price: config.price + field.price }];
  }

  return [config];
}

/**
 * The order-pricing spec's 0-Ft rule, enforced at save time: an orderable
 * product must have no form-reachable configuration that prices at 0 Ft —
 * for a length-priced product, judged by its per-meter price, since every
 * length would sell for 0 Ft. This is the server-side half of the rule; the
 * storefront keeps its own build-time gate over Tina content
 * (`src/lib/data.ts`) until the cutover, after which this check is the only
 * one. Price composition mirrored from the storefront: choice options,
 * toggles and material picks contribute their prices, a visible input
 * contributes its `price` even while empty, embroidery only ever adds when
 * enabled, and the length source field carries no price — it scales.
 *
 * Returns the picks of an offending configuration, or `undefined` when every
 * reachable configuration prices above 0 Ft.
 */
function zeroPricePicks(definition: ProductDefinition): string[] | undefined {
  if (!definition.orderable) {
    return undefined;
  }

  const sourceFieldId =
    definition.pricing.kind === "length" ? definition.pricing.sourceFieldId : undefined;
  const { order, cyclic } = dependencyOrder(definition.fields);
  const knownFieldIds = new Set(definition.fields.map((field) => field.id));
  let branches: Configuration[] = [
    { price: definition.basePrice, picks: [], values: new Map(), materials: [] },
  ];

  for (const field of order) {
    const next: Configuration[] = [];

    for (const config of branches) {
      if (isVisible(field, cyclic, knownFieldIds, config.values)) {
        next.push(...extend(definition, field, sourceFieldId, config));
      } else {
        next.push(config);
      }
    }

    branches = next.filter((config) => config.price === 0);

    if (branches.length === 0) {
      return undefined;
    }
  }

  const zero = branches.find((config) => config.price === 0);

  return zero === undefined ? undefined : zero.picks;
}

/**
 * Validates a definition handed to the admin API against the canonical
 * ProductDefinitionSchema and repo policy that zod alone cannot see: unique
 * field ids, unique option ids per choice field, unique material ids per
 * material field, numeric-capable pricing/color-count sources, forbidden
 * combinations whose members exist in Vendure and are actually offered by
 * this product's material fields, and the 0-Ft rule (see
 * {@link zeroPricePicks}).
 */
export function validateProductDefinition(
  input: unknown,
  existingMaterialSlugs: ReadonlySet<string>
): ProductDefinitionValidationResult {
  const parsed = ProductDefinitionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }

  const definition = parsed.data;
  const errors: string[] = [];
  const fieldIds = new Set<string>();

  for (const field of definition.fields) {
    if (fieldIds.has(field.id)) {
      errors.push(`${field.id}: Ez a mezőazonosító már létezik.`);
    }

    fieldIds.add(field.id);
  }

  const stringValuedIds = stringValuedFieldIds(definition.fields);

  if (definition.pricing.kind === "length") {
    errors.push(
      ...numericSourceErrors(
        'A méteráru "sourceField"',
        definition.pricing.sourceFieldId,
        definition.fields,
        fieldIds,
        stringValuedIds
      )
    );
  }

  for (const field of definition.fields) {
    if (field.kind !== "material" || field.colorCount.kind !== "from-field") {
      continue;
    }

    errors.push(
      ...numericSourceErrors(
        `A "${field.label}" anyagmező színszám-forrása`,
        field.colorCount.fieldId,
        definition.fields,
        fieldIds,
        stringValuedIds
      )
    );
  }

  const offeredMaterials = new Set(
    definition.fields
      .filter((field) => field.kind === "material")
      .flatMap((field) => field.options.map((option) => option.materialId))
  );

  for (const combination of definition.forbiddenMaterialCombinations) {
    for (const materialId of combination) {
      if (!offeredMaterials.has(materialId)) {
        errors.push(
          `${materialId}: A tiltott kombináció olyan anyagra hivatkozik, ami egyik anyagmezőben sem szerepel.`
        );
      } else if (!existingMaterialSlugs.has(materialId)) {
        errors.push(`${materialId}: Nincs anyag ezzel az azonosítóval.`);
      }
    }
  }

  errors.push(...duplicateEntryErrors(definition));

  const zeroPicks = zeroPricePicks(definition);

  if (zeroPicks !== undefined) {
    const combination = zeroPicks.length > 0 ? zeroPicks.join(", ") : "nincs opció";

    errors.push(`${definition.id}: A termék 0 Ft-ért adható el: ${combination}.`);
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, definition };
}
