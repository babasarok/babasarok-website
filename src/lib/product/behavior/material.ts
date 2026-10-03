import type { Field } from "../../types.svelte";
import { defineBehavior } from "./index";
import {
  bannedMaterialFieldNames,
  findMaterialOption,
  formatMaterialValue,
  isMaterialInOption,
  resolveColorCount,
} from "../materials";

/**
 * Behaviour of the `material` field type: it picks one entry of its own
 * `materials` list (not `items`) plus a set of colours, so its value is the
 * `{ material_id, colors }` object rather than a scalar — it never supplies a
 * cross-field reference value, and the colours never change the price.
 */
export const materialBehavior = defineBehavior("material", {
  normalize: (f, ctx) => {
    f.value ??= { material_id: "", colors: [] };
    if (!f.value.material_id) {
      return;
    }

    const count = resolveColorCount(f, { fields: ctx.fields });
    // Resolving failed, bail.
    if (count == null) {
      return;
    }

    if (f.value.colors.length > count) {
      f.value.colors = f.value.colors.slice(0, count);
    }
  },
  resolveValue: () => {
    // A material value is a {material_id, colors} object, not a scalar the
    // rest of the form can reference.
    return;
  },
  price: (f) => {
    // A `material` field picks one of its own `materials`; its price comes
    // from that entry (not the flat field `price`). Unchosen → no price, so
    // it contributes nothing until the buyer selects a material.
    const material = findMaterialOption(f, f.value?.material_id);
    return { label: f.label || f.name, price: material?.price ?? undefined };
  },
  enumerate: (f) => {
    // The form requires a material; colours never change the price, so each
    // entry is one choice with an empty colour selection. Pruning a choice
    // that would complete a banned combination is cross-field and stays with
    // the caller (`completesBannedCombination`).
    const choices: Field[] = [];
    for (const material of f.materials ?? []) {
      if (!material) {
        continue;
      }
      choices.push({
        ...f,
        value: { material_id: material.material_path.material_id, colors: [] },
      });
    }
    return choices;
  },
  fillFromParams: (f, raw) => {
    // An unknown material id is ignored (deep-link spec: prefilled values
    // are validated like normal selections), so the field stays unselected.
    if (!isMaterialInOption(f, raw)) {
      return;
    }
    f.value ??= { material_id: "", colors: [] };
    f.value.material_id = raw;
  },
  toSaved: (f) =>
    f.value ? { material_id: f.value.material_id, colors: [...f.value.colors] } : undefined,
  validate: (f, ctx) => {
    f.value ??= { material_id: "", colors: [] };
    f.value.error = undefined;
    // Backstop for every path that can set a material (deep links, restored
    // baskets, future callers): an id the field does not offer counts as no
    // selection, mirroring the basket-restore membership check.
    if (!f.value.material_id || !isMaterialInOption(f, f.value.material_id)) {
      f.value.error = "Kötelező mező";
      return;
    }
    const count = resolveColorCount(f, { fields: ctx.fields });
    if (!count) {
      f.value.error = "Színt nem lehet választani, más érték még nincs megadva";
      return;
    }
    if (f.value.colors.length < count) {
      f.value.error = `${count == 1 ? "" : count.toString()} színt kell választani`;
      return;
    }
    // Once the selection is otherwise complete, flag every field whose
    // material completes a banned combination (form-level enforcement).
    if (bannedMaterialFieldNames(ctx.fields, ctx.banned ?? []).has(f.name)) {
      f.value.error = "Ez az anyagkombináció nem rendelhető";
    }
  },
  hasError: (f) => (f.value ? !!f.value.error : false),
  clearErrors: (f) => {
    if (f.value) {
      f.value.error = undefined;
    }
  },
  formatValue: (f, _ctx) => {
    const value = f.value;
    if (!value?.material_id) {
      return;
    }
    return formatMaterialValue(findMaterialOption(f, value.material_id), value);
  },
  includeInEmail: () => {
    // A material pick is always required (validation.ts flags an empty pick),
    // so a visible material field always has something to report.
    return true;
  },
  formatForEmail: (f, _ctx) => {
    const value = f.value;
    if (!value?.material_id) {
      return "";
    }
    // A `material` field picks from its own `materials` list (not `items`).
    return formatMaterialValue(findMaterialOption(f, value.material_id), value);
  },
});
