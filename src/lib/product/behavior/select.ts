import { defineBehavior } from "./index";

/**
 * TODO(field-behavior): real behaviour for the `select` field type. Stub for now
 * so the {@link FIELD_BEHAVIORS} registry type-checks; the body is the per-type
 * logic extracted from the scattered `switch (field.type)` sites.
 */
export const selectBehavior = defineBehavior("select", {
  normalize: (f, _ctx) => {
    void f;
  },
  resolveValue: (f) => {
    void f;
    return;
  },
  price: (f) => {
    void f;
    return;
  },
  enumerate: (f) => {
    void f;
    return [f];
  },
  fillFromParams: (f, _raw) => {
    void f;
  },
  toSaved: (f) => {
    void f;
    return;
  },
  validate: (f, _ctx) => {
    void f;
  },
  hasError: (f) => {
    void f;
    return false;
  },
  clearErrors: (f) => {
    void f;
  },
  formatValue: (f, _ctx) => {
    void f;
    return;
  },
  includeInEmail: (f) => {
    void f;
    return false;
  },
  formatForEmail: (f, _ctx) => {
    void f;
    return "";
  },
});
